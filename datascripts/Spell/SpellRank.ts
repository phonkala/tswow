import { SQL } from "wotlkdata";
import { Transient } from "wotlkdata/wotlkdata/cell/serialization/Transient";
import { CellSystem } from "wotlkdata/wotlkdata/cell/systems/CellSystem";

export class SpellRank<T> extends CellSystem<T>{
    @Transient
    spellId: number;

    constructor(owner: T, spellId: number) {
        super(owner);
        this.spellId = spellId;
    }

    protected getRow() {
        return SQL.spell_ranks.find({spell_id: this.spellId});
    }

    exists() {
        return SQL.spell_ranks.filter({spell_id: this.spellId}).length != 0;
    }

    set(firstSpell: number, rank: number) {
        SQL.spell_ranks.add(firstSpell,rank,{spell_id:this.spellId});
    }

    getFirstSpell() {
        return this.getRow() === undefined
            ? undefined
            : this.getRow().first_spell_id.get();
    }

    getRank() {
        return this.getRow().rank.get();
    }

    objectify() {
        return {
            firstSpell: this.getFirstSpell(),
            rank: this.getRank()
        }
    }
}