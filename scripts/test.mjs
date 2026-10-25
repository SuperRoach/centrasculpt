import './compile-core.mjs';
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const result=spawnSync(process.execPath,['--test',...readdirSync('tests').filter(f=>f.endsWith('.test.mjs')).map(f=>`tests/${f}`)],{stdio:'inherit'});
process.exit(result.status ?? 1);
