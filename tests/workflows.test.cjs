const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {parse}=require('yaml');
const context={module:{exports:{}},require:()=>({Plugin:class{},Modal:class{},PluginSettingTab:class{},Setting:class{},Notice:class{},parseYaml:parse,normalizePath:s=>s.replace(/\/+/g,'/')}),Date,console};
const obsidian=context.require();
const settingsContext={module:{exports:{}},require:()=>obsidian};
vm.runInNewContext(fs.readFileSync(require.resolve('../src/settings.js'),'utf8'),settingsContext);
context.require=name=>name==='./settings'?settingsContext.module.exports:obsidian;
vm.runInNewContext(fs.readFileSync(require.resolve('../src/main.js'),'utf8'),context);
const Main=context.module.exports;
const note=(fm,body='')=>'---\n'+Object.entries(fm).map(([key,value])=>`${key}: ${JSON.stringify(value)}`).join('\n')+'\n---\n'+body;
function fixture(settings={}){
 const plugin=new Main();plugin.settings=Main.validateSettings(settings);plugin.refreshers=new Set();
 const data=new Map(),files=new Map();
 const add=(path,text)=>{const file={path,basename:path.split('/').pop().replace(/\.md$/,'')};data.set(path,text);files.set(path,file);return file;};
 plugin.loadData=async()=>plugin.settings;plugin.saveData=async()=>{};
 plugin.app={vault:{getMarkdownFiles:()=>[...files.values()],getAbstractFileByPath:p=>files.get(p),cachedRead:async f=>data.get(f.path),read:async f=>data.get(f.path),create:async(p,t)=>{if(data.has(p))throw Error('Exists');return add(p,t);},process:async(f,fn)=>{data.set(f.path,fn(data.get(f.path)));}},metadataCache:{getFirstLinkpathDest:()=>null},workspace:{getLeaf:()=>({openFile:async()=>{}})}};
 return {plugin,data,add};
}
test('configurable completion requires all boards and rejects missing or duplicate cards',()=>{
 const board={cards:[{path:'Tasks/A.md',column:'Released'}],errors:[]};
 let boards=new Map([['Boards/A.md',board]]);
 assert.equal(Main.calculate('Tasks/A.md',['Boards/A.md'],boards,['Released']).status,'Terminé');
 assert.equal(Main.calculate('Tasks/A.md',['Boards/A.md','Boards/B.md'],boards,['Released']).status,'Incohérent');
 board.cards.push({...board.cards[0]});
 assert.equal(Main.calculate('Tasks/A.md',['Boards/A.md'],boards,['Released']).status,'Incohérent');
});
test('parser ignores code fences and archived cards; rejects non-note cards',()=>{
 const board=Main.parseBoard('---\ntype: workflow\n---\n## Ready\n- [ ] [[Tasks/A]]\n```md\n- [ ] [[Ignore]]\n```\n- [ ] plain text\n***\n## Archived\n- [ ] [[Ignore]]');
 assert.equal(board.cards.length,1);assert.equal(board.errors.length,1);
});
test('default English schema produces valid snapshots and creates linked tasks',async()=>{
 const {plugin,add,data}=fixture();
 add('Projects/Demo.md',note({type:'project'}));
 add('Boards/Review.md',note({type:'workflow','kanban-plugin':'board'},'## Ready\n\n## Done\n'));
 await plugin.createTicket({title:'Example',project:'Projects/Demo.md',workflows:['Boards/Review.md'],permanent:true},'');
 const snapshot=await plugin.snapshot();
 assert.equal(snapshot.tickets.length,1);assert.equal(snapshot.tickets[0].result.errors.length,0);
 const text=data.get('Tasks/T-001 - Example.md');assert.match(text,/"recurring": true/);assert.match(text,/"project":/);assert.doesNotMatch(text,/projet:/);
 assert.match(data.get('Boards/Review.md'),/\[\[Tasks\/T-001 - Example\]\]/);
});
test('custom root, folder, type, ID and property mapping work without default folders',async()=>{
 const {plugin,add,data}=fixture({root:'Workspace',folders:{tickets:'Issues',boards:'Teams',projects:'Initiatives'},types:{ticket:'issue',board:'process',project:'initiative'},properties:{id:'key',projet:'parent',workflows:'pipelines'},idPrefix:'ISSUE-',completedColumns:['Shipped']});
 add('Workspace/Initiatives/Demo.md',note({type:'initiative'}));
 add('Workspace/Teams/Review.md',note({type:'process','kanban-plugin':'board'},'## Ready\n\n## Shipped\n'));
 await plugin.createTicket({title:'Example',project:'Workspace/Initiatives/Demo.md',workflows:['Workspace/Teams/Review.md'],permanent:false},'Workspace/');
 const s=await plugin.snapshot();assert.equal(s.tickets[0].result.errors.length,0);assert.equal(s.tickets[0].fm.id,'ISSUE-001');
 assert.match(data.get('Workspace/Issues/ISSUE-001 - Example.md'),/"parent":/);
 add('Outside/Hidden.md',note({type:'issue',key:'ISSUE-001'}));assert.equal((await plugin.snapshot()).tickets.length,1);
});
test('duplicate IDs and missing projects remain visible',async()=>{
 const {plugin,add}=fixture();for(const n of ['A','B'])add(`Tasks/${n}.md`,note({type:'task',id:'T-001',project:'[[Projects/Missing]]',workflows:[]}));
 const s=await plugin.snapshot();assert.equal(s.tickets.length,2);assert(s.tickets.every(t=>t.result.status==='Incohérent'&&t.result.errors.length===2));
});
test('CRM reads configurable folders, client directory and closure columns',async()=>{
 const {plugin,add}=fixture({folders:{campaigns:'Sales/Pipelines',deals:'Sales/Deals',people:'Contacts'}});
 add('Contacts/Example.md',note({type:'organization'}));
 add('Sales/Pipelines/Launch.md',note({type:'campaign',won_columns:['Signed'],lost_columns:['Lost']},'## Signed\n- [ ] [[Sales/Deals/Example]]'));
 add('Sales/Deals/Example.md',note({type:'deal',campaign:'[[Sales/Pipelines/Launch]]',client:'[[Contacts/Example]]',amount:250,currency:'EUR'}));
 const s=await plugin.crmSnapshot();assert.equal(s.dossiers.length,1);assert.equal(s.dossiers[0].status,'Gagné');assert.equal(s.dossiers[0].errors.length,0);
});
test('settings reject traversal, ambiguous property mappings and invalid columns',()=>{
 assert.throws(()=>Main.validateSettings({root:'../outside'}));assert.throws(()=>Main.validateSettings({folders:{tickets:'/absolute'}}));
 assert.throws(()=>Main.validateSettings({properties:{id:'type'}}));assert.throws(()=>Main.validateSettings({completedColumns:[]}));
 assert.throws(()=>Main.validateSettings({idPrefix:'../'}));assert.throws(()=>Main.validateSettings({currency:'invalid'}));
});
test('invalid dates and filenames are rejected before writes',async()=>{
 assert.equal(Main.validDate('2026-02-30'),false);assert.equal(Main.validDate('2026-02-28'),true);
 const {plugin,data}=fixture();await assert.rejects(()=>plugin.createTicket({title:'../escape',workflows:['Board']},''));assert.equal(data.size,0);
});
test('card insertion skips headings in frontmatter and code and preserves dollar text',()=>{
 const original='---\ndescription: |\n  ## Metadata\n---\n```md\n## Code\n```\n## Ready\n\n## Done';
 const result=Main.insertCard(original,'Tasks/$& - Example');
 assert.match(result,/## Ready\n\n- \[ \] \[\[Tasks\/\$& - Example\]\]/);
 assert.equal(Main.parseBoard(result).cards.length,1);
});
test('creation rejects out-of-scope boards and duplicates without writing',async()=>{
 const {plugin,add,data}=fixture();add('Projects/A.md',note({type:'project'}));add('Boards/A.md',note({type:'workflow','kanban-plugin':'board'},'## Ready'));
 const before=data.size;await assert.rejects(()=>plugin.createTicket({title:'Bad',project:'Projects/A.md',workflows:['Boards/A.md','Boards/A.md']},''));
 await assert.rejects(()=>plugin.createTicket({title:'Bad',project:'Projects/A.md',workflows:['Elsewhere/A.md']},''));assert.equal(data.size,before);
});
