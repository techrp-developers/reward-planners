// Local backup only. Does not run migrations or print credentials.
const fs=require('node:fs');const path=require('node:path');const {spawnSync}=require('node:child_process');
require('dotenv').config({path:path.join(__dirname,'../.env'),quiet:true});
const host=process.env.DB_HOST||'localhost';
if(!['localhost','127.0.0.1','::1'].includes(host)||process.env.NODE_ENV==='production')throw new Error('Local non-production database required.');
const executable=process.env.SERVICE_DB_DUMP_BIN||'C:\\xampp\\mysql\\bin\\mysqldump.exe';
if(!fs.existsSync(executable))throw new Error('Set SERVICE_DB_DUMP_BIN to the installed MariaDB dump executable.');
const directory=path.join(__dirname,'../files/service-manager-p0/backups');fs.mkdirSync(directory,{recursive:true});
const file=path.join(directory,`local-before-p0-${new Date().toISOString().replace(/[:.]/g,'-')}.sql`);
const result=spawnSync(executable,[`--host=${host}`,`--port=${process.env.DB_PORT||3306}`,`--user=${process.env.DB_USER||'root'}`,'--single-transaction','--quick','--routines','--triggers','--events',`--result-file=${file}`,process.env.DB_NAME||'rewardplanners_db'],{env:{...process.env,MYSQL_PWD:process.env.DB_PASSWORD||''},encoding:'utf8',windowsHide:true});
if(result.error||result.status!==0){console.error('Backup failed; do not migrate. Check the local dump installation and database permissions.');process.exitCode=1;}
else {const size=fs.statSync(file).size;if(!size)throw new Error('Backup is empty.');console.log(JSON.stringify({file,bytes:size,migrationsExecuted:false}));}
