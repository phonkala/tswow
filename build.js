/**
 * This file is used to bootstrap the other compiler scripts.
 */
const child_process = require('child_process');
const path = require('path');
const fs = require('fs')

const buildConf = fs.readFileSync('./build.conf','utf-8')

const buildDir = buildConf.match(/^BuildDirectory *= *"(.+?)"/m)[1]
const installDir = buildConf.match(/^InstallDirectory *= *"(.+?)"/m)[1]
const displayNames = (buildConf.match(/^Terminal\.DisplayNames *= *(.+)/m)||['','true'])[1]
const displayTimestamps = (buildConf.match(/^Terminal\.DisplayTimestamps *= *(.+)/m)||['','true'])[1]

const shouldDisplayNames = displayNames === 'true'
    || displayNames === '1'
const shouldDisplayTimestamps = displayTimestamps === 'true'
    || displayTimestamps === '1'

const bootstrapDir = path.join(buildDir,'bootstrap')

const buildScripts = () =>
    child_process.execSync(
          `npx swc tswow-scripts -d ${bootstrapDir}`
        , {stdio:'inherit'}
    )
try { buildScripts() }
catch(error) {
    child_process.execSync('npm i -D @swc/core @swc/cli')
    try { buildScripts() }
    catch(error) {
        console.log(`Failed to bootstrap tswow: ${error}`);
        process.exit(0)
    }
}

child_process.execSync(
      `node -r source-map-support/register`
    + ` ${path.join(bootstrapDir,'compile','CompileTsWow.js')}`
    + ` ${process.argv.slice(2).join(' ')}`
    + ` --ignore **/wotlkdata/**`
    + ` --ipaths=${installDir}`
    + ` --bpaths=${buildDir}`
    + ` ${shouldDisplayNames?'--displayNames':''}`
    + ` ${shouldDisplayTimestamps?'--displayTimestamps':''}`
,{stdio:'inherit'});