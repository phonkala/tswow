/*
 * This file is part of tswow (https://github.com/tswow)
 *
 * Copyright (C) 2020 tswow <https://github.com/tswow/>
 * This program is free software: you can redistribute it and/or
 * modify it under the terms of the GNU General Public License as
 * published by the Free Software Foundation, version 3.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */
import { wfs } from '../util/FileSystem';
import { term } from '../util/Terminal';
import yaml = require('js-yaml');
import { cfg } from '../util/Config';

// TODO: Handle other types of quotes
function splitArgs(command: string) {
    const args: string[] = [];
    let inString = false;
    let escaped = false;
    let cur = '';
    for (let i = 0; i < command.length; ++i) {
        if (command[i] === '"' && !escaped) {
            inString = !inString;
        } else if (command[i] === '\\' && inString && !escaped) {
            escaped = true;
        } else if (command[i] === ' ' && !inString) {
            args.push(cur);
            cur = '';
        } else {
            cur += command[i];
        }
    }
    if (cur.length > 0) { args.push(cur); }
    return args.filter(x => x.length > 0);
}

/**
* Represents a command, or group of commands,
* that a user can invoke in the tswow interactive prompt.
*
* A command can contain a function to invoke when called,
* or contain named child commands, or both.
*/
export class Command {
    readonly handler?: (args: string[]) => void;
    readonly children: {[key: string]: Command} = {};
    readonly description?: string;
    readonly argDesc?: string;
    readonly name: string;
    readonly parent?: Command;

    constructor(name: string, argDesc?: string, description?: string, onCommand?: (args: string[]) => void, parent?: Command) {
        this.name = name;
        this.parent = parent;
        this.handler = onCommand;
        this.argDesc = argDesc;
        this.description = description;
    }

    /**
    * The full name of this command (the full command a user has to type to invoke it)
    */
    get fullname(): string { return this.parent !== undefined && this.parent.parent !== undefined ?
        `${this.parent.fullname} ${this.name}` : this.name; }


    /**
    * Registers a child command that can be executed when following this command.
    * @param name - Name of the root command
    * @param argDesc - Description of the argument the command expects
    * @param help - Description of what the command does.
    * @param callback - The function to call when the command is typed.
    *
    * @example
    *     addCommand('printHi','','Prints string "hello world"',async()=>console.log('Hello world!'))
    *     addCommand('printArgs','args[]','Prints arguments to console',async(args)=>conosle.log(args.join(' ')))
    */
    addCommand(name: string, argDesc?: string, description?: string, handler?: (args: string[]) => any): Command {
        if (this.children[name] !== undefined) {
            throw new Error(`Multiple commands: ${this.fullname}#${name}`);
        }
        return this.children[name] = new Command(name, argDesc, description, handler, this);
    }

    /**
     * Removes a command from this compound
     * @param name
     */
    removeCommand(name: string) {
        if (this.children[name] !== undefined) {
            delete this.children[name];
        }
    }

    /**
    * Finds a command from an input chain
    * @param input
    */
    findCommand(input: string[]): Command {
        if (input.length === 0) { return this; }
        const child = this.children[input[0]];
        if (child === undefined) {
            return this;
        } else {
            return child.findCommand(input.slice(1));
        }
    }

    /**
    * Invokes this commmand with some provided arguments.
    *
    * If this command contains no function and no children matching the first argument, an exception is thrown.
    *
    * If this command contains a child matching the first argument,
    * we call the `handle` method on the child object and won't invoke our own function.
    *
    * For example, the command `a b` will first check if command `a` has a child `b`,
    * and only if it doesn't call `a` directly with `b` as an argument.
    *
    * @param args
    */
    async handle(args: string[]): Promise<void> {
        const fa = args[0];
        const fc = this.children[fa];
        if (fc !== undefined) {
            await fc.handle(args.slice(1));
        } else {
            if (this.handler === undefined) {
                throw new Error(`No command ${this.parent !== undefined ? `${this.fullname} ` : ''}${args[0]}`);
            }
            await this.handler(args);
        }
    }
}

/**
* Functions concerning the tswow interactive prompts.
*/
export namespace commands {
    const rootCommand = new Command('', '', '');

    export async function sendCommand(input: string) {
        const cmd = rootCommand.findCommand(input.split(' ').filter(x => x.length > 0));
        if (cmd === undefined) {
            return;
        }

        term.setEnabled(false);

        // 'command' commands cannot be concatenated.
        const coms = input.startsWith('command') ?
            [input] : input.split('&&');

        for (const com of coms) {
            const args = splitArgs(com);
            try {
                await rootCommand.handle(args);
            } catch (error) {
                if (error && error.message) {
                    if (cfg.display.print_stacktrace()) {
                        term.error(error, error.stack);
                    } else {
                        term.error(error);
                    }
                }
            }
        }
        term.setEnabled(true);
    }

    /**
    * Enters the tswow interactive program, allowing the user to type in commands into the window and executing them.
    */
    export async function enterLoop() {
        term.setEnabled(true);
        term.setInputCallback(async (input) => {
            sendCommand(input);
        });
    }

    /**
    * Registers a root command that can be directly executed when typed by a user.
    * @param name - Name of the root command
    * @param argDesc - Description of the argument the command expects
    * @param help - Description of what the command does.
    * @param callback - The function to call when the command is typed.
    *
    * @example
    *     addCommand('printHi','','Prints string "hello world"',async()=>console.log('Hello world!'))
    *     addCommand('printArgs','args[]','Prints arguments to console',async(args)=>conosle.log(args.join(' ')))
    */
    export function addCommand(name: string, argDesc?: string, help?:  string, callback?: (args: string[]) => any) {
        return rootCommand.addCommand(name, argDesc, help, callback);
    }

    // Print command
    addCommand('print', 'messages', 'Prints out messages to the screen', (args) => {
        term.log(args.join(' '));
    });

    // Custom commands
    const commandfile = './config/commands.yaml';
    let customCommands: {[key: string]: string} = {};
    export function addCustomCommand(name: string, args: string[]) {
        customCommands[name] = args.join(' ');
        wfs.write(commandfile,
            yaml.dump(customCommands));
        rootCommand.removeCommand(name);
        rootCommand.addCommand(name, '', '', async (runArgs) => {
            await sendCommand(args.concat(runArgs).join(' '));
        });
    }
    addCommand('command', 'alias command', 'Creates a command alias', (args) => {
        addCustomCommand(args[0], args.slice(1));
    });
    if (wfs.exists(commandfile)) {
        customCommands = yaml.load(
            wfs.read(commandfile));
        for (const key in customCommands) {
            if (customCommands[key] !== undefined) {
                addCustomCommand(key, customCommands[key].split(' '));
            }
        }
    }

    // Help command
    addCommand('help', 'command, [args]?', 'Prints this help message', async(args) => {
        let cur = rootCommand;
        for (const arg of args) {
            const cpd = cur;
            if (cpd.children[arg] === undefined) {
                return term.warn(`${cpd.fullname} has no child command ${arg}`);
            }
            cur = cpd.children[arg];
        }

        let spaces = 0;
        function printCommand(curPrint: Command) {
            if (curPrint.handler) { term.magenta(`${' '.repeat(spaces * 2)}${
                curPrint.name}${curPrint.argDesc && curPrint.argDesc.length > 0 ? ` (${curPrint.argDesc})` : ''}${
                    curPrint.description && curPrint.description.length > 0 ? ` - ${curPrint.description}` : ''}`);
            } else if (curPrint.parent !== undefined) {
                term.magenta(`${' '.repeat(spaces * 2)}${curPrint.name}`);
            } else {
                --spaces;
            }

            for (const child of Object.values(curPrint.children)) {
                ++spaces;
                printCommand(child);
                --spaces;
            }
        }
        printCommand(cur);
    });
}
