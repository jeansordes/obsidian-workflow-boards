const {Plugin, MarkdownRenderChild, Modal, Notice, parseYaml, PluginSettingTab, Setting, normalizePath} = require('obsidian');
const {DEFAULT_SETTINGS,validateSettings,WorkflowSettings}=require('./settings');
const clean = s => String(s || '').replace(/^\[\[|\]\]$/g, '').split('|')[0].split('#')[0].replace(/\.md$/, '');
const list = x => Array.isArray(x) ? x : x ? [x] : [];
const localDate = () => { const d=new Date(); return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'); };
function frontmatter(text) {
 const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
 return m ? parseYaml(m[1]) || {} : {};
}
function parseBoard(text) {
 const cards = [], errors = [], columns = []; let column = null, fence = false, front = false;
 for (const [i,line] of text.split(/\r?\n/).entries()) {
  if (i === 0 && line === '---') {front=true;continue;}
  if (front) {if(line==='---')front=false;continue;}
  if (line.startsWith('%% kanban:settings') || line.trim()==='***') break;
  if (/^```/.test(line)) {fence=!fence;continue;}
  if(fence)continue;
  const heading=line.match(/^## (.+)$/);if(heading){column=heading[1].trim();columns.push({name:column,line:i});continue;}
  if(/^\s*- \[/.test(line)) {
   const m=line.match(/^- \[[ xX]\] \[\[([^\]]+)\]\]\s*$/);
   if(!m || !column)errors.push(`Carte invalide ligne ${i+1}`);
   else cards.push({target:clean(m[1]),column,line:i});
  }
 }
 return {cards,errors,columns};
}
function insertCard(text,target){
 const board=parseBoard(text);if(!board.columns.length)throw Error('Workflow sans colonne.');
 const lines=text.split(/\r?\n/);lines.splice(board.columns[0].line+1,0,'','- [ ] [['+target+']]');return lines.join('\n');
}
function calculate(ticketPath, expected, boards, completedColumns=['Done']) {
 const stages=[], errors=[];
 if (!expected.length) {
  for(const [path,board] of boards)if(board.cards.some(c=>c.path===ticketPath))errors.push('Affiliation manquante : '+path);
  return {status:errors.length?'Incohérent':'À qualifier',stages,errors};
 }
 if(new Set(expected).size!==expected.length)errors.push('Workflow déclaré plusieurs fois');
 for(const path of expected) {
  const board=boards.get(path);
  if(!board){errors.push('Workflow absent : '+path);continue;}
  if(board.errors.length)errors.push(...board.errors.map(e=>path+': '+e));
  const found=board.cards.filter(c=>c.path===ticketPath);
  if(found.length!==1)errors.push(found.length ? 'Carte dupliquée : '+path : 'Carte manquante : '+path);
  else stages.push({workflow:path,column:found[0].column});
 }
 for(const [path,board] of boards)if(!expected.includes(path)&&board.cards.some(c=>c.path===ticketPath))errors.push('Affiliation manquante : '+path);
 return {status:errors.length?'Incohérent':stages.every(x=>completedColumns.includes(x.column))?'Terminé':'Ouvert',stages,errors};
}
const dateValue = value => value instanceof Date ? value.toISOString().slice(0,10) : String(value || '');
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
function nextAction(text){
 const body=text.replace(/^---\r?\n[\s\S]*?\r?\n---/, '');
 const section=title=>{const match=new RegExp('^## '+title+'[^\\n]*\\n','m').exec(body);return match?body.slice(match.index+match[0].length).split(/^## /m)[0]:'';};
 const lines=(section('Prochaine action')||section('Travaux')).split('\n').map(x=>x.trim()).filter(Boolean);
 const unchecked=lines.find(l=>/^- \[ \]/.test(l));
 return (unchecked||lines.find(l=>!/^[-*] \[[xX]\]/.test(l))||'').replace(/^[-*] \[[ xX]\]\s*/, '');
}
class Form extends Modal {
 constructor(app,title,build,submit){super(app);this.title=title;this.build=build;this.submit=submit;}
 onOpen(){this.contentEl.createEl('h2',{text:this.title});const form=this.contentEl.createEl('form');this.build(form);const b=form.createEl('button',{text:'Enregistrer',attr:{type:'submit'}});form.onsubmit=async e=>{e.preventDefault();b.disabled=true;try{await this.submit(form);this.close();}catch(err){new Notice(err.message);b.disabled=false;}};}
 onClose(){this.contentEl.empty();}
}
class Workflows extends Plugin {
 async onload(){
  this.settings=validateSettings({...DEFAULT_SETTINGS,...await this.loadData()});
  this.addSettingTab(new WorkflowSettings(this.app,this));
  this.busy=false;this.refreshers=new Set();
  this.registerMarkdownCodeBlockProcessor('workflow-tickets',(source,el,ctx)=>{
   let stopped=false, serial=0;
   const refresh=async()=>{const token=++serial;try{const snapshot=await this.snapshot(ctx.sourcePath);if(!stopped&&token===serial)this.render(el,source,ctx.sourcePath,snapshot);}catch(e){if(!stopped)el.setText('Vue Workflow Boards indisponible : '+e.message);}};
   const child=new MarkdownRenderChild(el);child.onunload=()=>{stopped=true;this.refreshers.delete(refresh);};ctx.addChild(child);this.refreshers.add(refresh);refresh();
  });
  this.registerMarkdownCodeBlockProcessor('workflow-crm',(source,el,ctx)=>{
   let stopped=false,serial=0;
   const refresh=async()=>{const token=++serial;try{const state=await this.crmSnapshot(ctx.sourcePath);if(!stopped&&token===serial)this.renderCRM(el,source,ctx.sourcePath,state);}catch(e){if(!stopped)el.setText('Vue CRM indisponible : '+e.message);}};
   const child=new MarkdownRenderChild(el);child.onunload=()=>{stopped=true;this.refreshers.delete(refresh);};ctx.addChild(child);this.refreshers.add(refresh);refresh();
  });
  this.registerMarkdownCodeBlockProcessor('workflow-dashboard',(source,el,ctx)=>{
   let stopped=false,serial=0;
   const refresh=async()=>{const token=++serial;try{const state=await this.snapshot(ctx.sourcePath);if(!stopped&&token===serial)this.renderDashboard(el,source,ctx.sourcePath,state);}catch(e){if(!stopped)el.setText('Tableau de bord indisponible : '+e.message);}};
   const child=new MarkdownRenderChild(el);child.onunload=()=>{stopped=true;this.refreshers.delete(refresh);};ctx.addChild(child);this.refreshers.add(refresh);refresh();
  });
  this.addCommand({id:'organize-ticket',name:'Organiser le ticket actif (responsable et prochaine action)',callback:()=>this.dashboardDialog()});
  const changed=()=>{clearTimeout(this.timer);this.timer=setTimeout(()=>{for(const fn of this.refreshers)fn();},250);};
  for(const event of ['modify','create','delete','rename'])this.registerEvent(this.app.vault.on(event,changed));
  this.registerEvent(this.app.metadataCache.on('resolved',changed));
  this.addCommand({id:'create-ticket',name:'Créer un ticket',callback:()=>this.createDialog()});
  this.addCommand({id:'log-ticket',name:'Journaliser et relancer le ticket permanent actif',callback:()=>this.journalDialog()});
  this.addCommand({id:'refresh',name:'Actualiser les vues',callback:changed});
 }
 onunload(){clearTimeout(this.timer);this.refreshers.clear();}
 root(){return this.settings.root ? this.settings.root+'/' : '';}
 folder(key){return this.settings.folders[key]+'/';}
 fm(text){const raw=frontmatter(text), normalized={...raw};for(const [key,value] of Object.entries(this.settings.properties))normalized[key]=raw[value];return normalized;}
 async saveSettings(){await this.saveData(this.settings);for(const refresh of this.refreshers)refresh();}
 resolve(target,source,root){
  const raw=clean(target);
  const direct=(raw.startsWith(root)?raw:root+raw)+'.md';
  return this.app.vault.getAbstractFileByPath(direct)?.path || this.app.metadataCache.getFirstLinkpathDest(raw,source)?.path || direct;
 }
 async crmSnapshot(source=''){
  const root=this.root(source),campaigns=new Map(),dossiers=[];
  for(const file of this.app.vault.getMarkdownFiles()){
   const rel=file.path.slice(root.length);if(!file.path.startsWith(root)||!(rel.startsWith(this.folder('campaigns'))||rel.startsWith(this.folder('deals'))))continue;
   const text=await this.app.vault.cachedRead(file),fm=this.fm(text);
   if(fm.type===this.settings.types.campaign&&rel.startsWith(this.folder('campaigns'))){
    const board=parseBoard(text);board.file=file;board.fm=fm;board.cards.forEach(c=>c.path=this.resolve(c.target,file.path,root));campaigns.set(file.path,board);
   }
   if(fm.type===this.settings.types.deal&&rel.startsWith(this.folder('deals')))dossiers.push({file,fm,errors:[]});
  }
  for(const d of dossiers){
   const path=this.resolve(d.fm.campagne,d.file.path,root),board=campaigns.get(path);d.campaign=path;
   if(!d.fm.campagne||Array.isArray(d.fm.campagne)||!board)d.errors.push('Campagne unique valide requise');
   const client=this.app.vault.getAbstractFileByPath(this.resolve(d.fm.client,d.file.path,root));
   const clientFm=client?this.fm(await this.app.vault.cachedRead(client)):{};
   if(!d.fm.client||Array.isArray(d.fm.client)||!client||!client.path.startsWith(root+this.folder('people'))||![this.settings.types.person,this.settings.types.organization].includes(clientFm.type))d.errors.push('Client d’annuaire valide requis');
   for(const contact of list(d.fm.contacts)){
    const f=this.app.vault.getAbstractFileByPath(this.resolve(contact,d.file.path,root));
    if(!f||!f.path.startsWith(root+this.folder('people'))||this.fm(await this.app.vault.cachedRead(f)).type!==this.settings.types.person)d.errors.push('Contact d’annuaire invalide');
   }
   if(board){
    d.errors.push(...board.errors);
    const won=list(board.fm.colonnes_gagnees),lost=list(board.fm.colonnes_perdues);
    if(won.some(c=>lost.includes(c)))d.errors.push('Colonnes de clôture contradictoires');
    const cards=board.cards.filter(c=>c.path===d.file.path);
    if(cards.length!==1)d.errors.push(cards.length?'Carte dupliquée':'Carte manquante');
    else {d.column=cards[0].column;d.status=won.includes(d.column)?'Gagné':lost.includes(d.column)?'Perdu':'Ouvert';}
   }
   for(const [p,b] of campaigns)if(p!==path&&b.cards.some(c=>c.path===d.file.path))d.errors.push('Carte dans une autre campagne');
   const value=d.fm.relance instanceof Date?d.fm.relance.toISOString().slice(0,10):String(d.fm.relance||'');d.date=value;
   if(value&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value))d.errors.push('Date de relance invalide');
   if(d.errors.length)d.status='Incohérent';
   d.due=d.status==='Ouvert'&&value&&value<=localDate();
  }
  const warnings=[];for(const b of campaigns.values())for(const c of b.cards)if(!dossiers.some(d=>d.file.path===c.path))warnings.push(b.file.basename+': carte sans dossier CRM '+c.target);
  return {root,campaigns,dossiers,warnings};
 }
 renderCRM(el,source,sourcePath,state){
  el.empty();let rows=state.dossiers;
  const scope=(source.match(/^scope:\s*(\w+)/m)||[])[1]||'tous';
  if(scope==='campagne'){const target=(source.match(/^campagne:\s*(.+)$/m)||[])[1];rows=rows.filter(d=>d.campaign===this.resolve(target||sourcePath,sourcePath,state.root));}
  if(scope==='responsable'){const target=(source.match(/^responsable:\s*(.+)$/m)||[])[1]||'';rows=rows.filter(d=>d.fm.responsable===target);}
  const valid=rows.filter(d=>!d.errors.length),won=valid.filter(d=>d.status==='Gagné').length,lost=valid.filter(d=>d.status==='Perdu').length,open=valid.filter(d=>d.status==='Ouvert');
  const hasAmount=d=>typeof d.fm.montant==='number'&&Number.isFinite(d.fm.montant)&&d.fm.montant>=0;
  const sum=open.filter(d=>d.fm.devise===this.settings.currency&&hasAmount(d)).reduce((n,d)=>n+d.fm.montant,0);
  el.createEl('p',{text:`${rows.length} dossiers · ${open.length} ouverts · ${won} gagnés · ${lost} perdus · Conversion : ${won+lost?Math.round(won/(won+lost)*100)+' %':'sans clôture'} · Potentiel connu : ${sum.toLocaleString()} ${this.settings.currency}`});
  el.createEl('p',{text:`${open.filter(d=>d.due).length} relances dues · ${open.filter(d=>!d.date).length} sans date · ${open.filter(d=>!hasAmount(d)||d.fm.devise!==this.settings.currency).length} montants exclus du potentiel (absents, invalides ou autre devise)`});
  for(const warning of state.warnings)el.createEl('p',{text:warning,cls:'mod-warning'});
  const table=el.createEl('table'),head=table.createEl('thead').createEl('tr');
  for(const title of ['Dossier','Campagne','Responsable','Étape','Prochaine action','Relance','Points à traiter'])head.createEl('th',{text:title});
  const body=table.createEl('tbody');rows.sort((a,b)=>Number(Boolean(b.due))-Number(Boolean(a.due))||(a.date||'9999').localeCompare(b.date||'9999'));
  for(const d of rows){
   const row=body.createEl('tr'),a=row.createEl('td').createEl('a',{text:d.file.basename,cls:'internal-link',attr:{href:d.file.path,'data-href':d.file.path}});a.onclick=e=>{e.preventDefault();this.app.workspace.openLinkText(d.file.path,sourcePath);};
   row.createEl('td',{text:d.campaign.split('/').pop().replace(/\.md$/,'')});row.createEl('td',{text:String(d.fm.responsable||'À attribuer')});row.createEl('td',{text:d.errors.length?'Incohérent':d.column||''});row.createEl('td',{text:String(d.fm.prochaine_action||'À définir')});row.createEl('td',{text:(d.due?'À relancer : ':'')+(d.date||'Sans date')});
   row.createEl('td',{text:[...d.errors,...(d.status==='Ouvert'&&!d.fm.prochaine_action?['Prochaine action manquante']:[]),...(!d.fm.responsable?['Responsable manquant']:[])].join(' ; ')});
  }
 }
 async snapshot(source=''){
  const root=this.root(source), files=this.app.vault.getMarkdownFiles().filter(f=>f.path.startsWith(root));
  const tickets=[],boards=new Map(),projects=[];
  for(const file of files){
   const rel=file.path.slice(root.length);
   if(!['tickets','boards','projects'].some(key=>rel.startsWith(this.folder(key))))continue;
   const text=await this.app.vault.cachedRead(file),fm=this.fm(text);
   if(rel.startsWith(this.folder('tickets'))&&fm.type===this.settings.types.ticket)tickets.push({file,fm,action:String(fm.prochaine_action||nextAction(text))});
   if(fm.type===this.settings.types.project&&rel.startsWith(this.folder('projects')))projects.push({file,fm});
   if(rel.startsWith(this.folder('boards'))&&fm.type===this.settings.types.board&&fm['kanban-plugin']==='board'){
    const board=parseBoard(text);board.file=file;board.fm=fm;
    board.cards.forEach(c=>{c.path=this.resolve(c.target,file.path,root);if(!this.app.vault.getAbstractFileByPath(c.path))board.errors.push('Ticket introuvable : '+c.target);});boards.set(file.path,board);
   }
  }
  const ids=new Map();for(const t of tickets)ids.set(t.fm.id,(ids.get(t.fm.id)||0)+1);
  for(const t of tickets){
   t.project=this.resolve(t.fm.projet,t.file.path,root);
   t.expected=list(t.fm.workflows).map(w=>this.resolve(w,t.file.path,root));t.result=calculate(t.file.path,t.expected,boards,this.settings.completedColumns);
   if(!t.fm.id||ids.get(t.fm.id)>1)t.result.errors.push('Identifiant absent ou dupliqué');
   if(!projects.some(p=>p.file.path===t.project)||Array.isArray(t.fm.projet))t.result.errors.push('Projet unique valide requis');
   if(t.result.errors.length)t.result.status='Incohérent';
  }
  return {root,tickets,boards,projects};
 }
 render(el,source,sourcePath,state){
  el.empty();const scope=(source.match(/scope:\s*(\w+)/)||[])[1]||'tous';
  let tickets=state.tickets;
  if(scope==='sans_suivi')tickets=tickets.filter(t=>![...state.boards.values()].some(b=>b.cards.some(c=>c.path===t.file.path)));
  if(scope==='projet')tickets=tickets.filter(t=>t.project===sourcePath);
  if(scope==='team'){const folder=(source.match(/^folder:\s*(.+)$/m)||[])[1];if(folder)tickets=tickets.filter(t=>t.expected.some(p=>p.startsWith(normalizePath(folder)+'/')));}
  tickets.sort((a,b)=>String(a.fm.id).localeCompare(String(b.fm.id),undefined,{numeric:true}));
  el.createEl('p',{text:`${tickets.length} tickets · Avancement lu dans les tableaux`});
  const table=el.createEl('table');const head=table.createEl('thead').createEl('tr');for(const x of ['Ticket','Projet','Avancement','Workflows','Qualification'])head.createEl('th',{text:x});
  const body=table.createEl('tbody');
  const link=(parent,path,label)=>{const a=parent.createEl('a',{text:label,cls:'internal-link',attr:{'data-href':path,href:path}});a.onclick=e=>{e.preventDefault();this.app.workspace.openLinkText(path,sourcePath);};};
  for(const t of tickets){const row=body.createEl('tr');link(row.createEl('td'),t.file.path,t.file.basename);const projectCell=row.createEl('td');if(t.fm.projet)link(projectCell,t.project,t.project.split('/').pop().replace(/\.md$/,''));else projectCell.setText('À rattacher');row.createEl('td',{text:t.result.status});const stages=row.createEl('td');for(const s of t.result.stages)stages.createEl('div',{text:s.workflow.split('/').pop().replace(/\.md$/,'')+': '+s.column});for(const e of t.result.errors)stages.createEl('div',{text:e,cls:'mod-warning'});row.createEl('td',{text:t.fm.qualification||'—'});}
 }
 async dashboardDialog(file=this.app.workspace.getActiveFile()){
  if(!file||this.fm(await this.app.vault.read(file)).type!==this.settings.types.ticket){new Notice('Ouvrir un ticket pour organiser le travail.');return;}
  const fm=this.fm(await this.app.vault.read(file)),root=this.root(file.path);
  if(!file.path.startsWith(root+this.folder('tickets')))throw Error('Ticket hors du dossier configuré.');
  const people=[];for(const person of this.app.vault.getMarkdownFiles()){if(person.path.startsWith(root+this.folder('people')) && this.fm(await this.app.vault.cachedRead(person)).type===this.settings.types.person)people.push(person.path.slice(root.length).replace(/\.md$/,''));}
  const data={responsable:clean(fm.responsable),prochaine_action:fm.prochaine_action||nextAction(await this.app.vault.read(file)),priorite:fm.priorite||'',echeance:dateValue(fm.echeance),blocage:fm.blocage||'',attente_de:fm.attente_de||'',focus:fm.focus===true};
  new Form(this.app,'Organiser '+fm.id,form=>{
   const field=(label,tag,value,attrs={})=>{const l=form.createEl('label',{text:label,cls:'wb-field'});const input=l.createEl(tag,{attr:attrs});input.value=value;return input;};
   const owner=field('Responsable du prochain résultat','select','');owner.createEl('option',{text:'À attribuer',attr:{value:''}});
   const current=data.responsable;for(const name of people){const value=name;owner.createEl('option',{text:name.split('/').pop(),attr:{value}});}if(current&&!people.some(n=>current===n))owner.createEl('option',{text:current,attr:{value:current}});owner.value=current;owner.onchange=()=>data.responsable=owner.value;
   const action=field('Prochaine action concrète','textarea',data.prochaine_action,{required:true,rows:'3'});action.oninput=()=>data.prochaine_action=action.value;
   const priority=field('Priorité','select','');for(const [value,label]of [['','À préciser'],['P1','P1 - prioritaire'],['P2','P2 - ensuite'],['P3','P3 - plus tard']])priority.createEl('option',{text:label,attr:{value}});priority.value=data.priorite;priority.onchange=()=>data.priorite=priority.value;
   const due=field('Échéance confirmée (facultative)','input',data.echeance,{type:'date'});due.oninput=()=>data.echeance=due.value;
   const block=field('Blocage à lever (facultatif)','textarea',data.blocage,{rows:'2'});block.oninput=()=>data.blocage=block.value;
   const wait=field('En attente de qui ou de quelle validation ?','input',data.attente_de);wait.oninput=()=>data.attente_de=wait.value;
   const l=form.createEl('label',{text:' À faire maintenant '});const check=l.createEl('input',{attr:{type:'checkbox'}});check.checked=data.focus;check.onchange=()=>data.focus=check.checked;
   form.createEl('p',{text:'Cette attribution organise le travail. Elle ne vaut pas autorisation de paiement, d’envoi ou d’engagement externe.'});
  },async()=>{
   if(!data.prochaine_action.trim())throw Error('Décrire la prochaine action.');
   if(data.echeance&&!validDate(data.echeance))throw Error('Échéance invalide.');
   if(this.busy)throw Error('Une opération Workflow Boards est déjà en cours.');this.busy=true;
   try{
    await this.app.fileManager.processFrontMatter(file,props=>{
     for(const key of ['prochaine_action','priorite','echeance','blocage','attente_de']){const value=String(data[key]||'').trim();if(value)props[this.settings.properties[key]]=value;else delete props[this.settings.properties[key]];}
     if(data.responsable)props[this.settings.properties.responsable]='[['+data.responsable+']]';else delete props[this.settings.properties.responsable];
     props[this.settings.properties.focus]=data.focus;
    });
    await this.app.vault.process(file,text=>text+(text.includes('## '+this.settings.journalHeading)?'':'\n## '+this.settings.journalHeading+'\n')+`\n### ${localDate()} - Organisation du travail\n\nResponsable : ${data.responsable?'[['+data.responsable+']]':'à attribuer'}. Prochaine action : ${data.prochaine_action.trim()}. Priorité : ${data.priorite||'à préciser'}. Échéance : ${data.echeance||'non fixée'}. À faire maintenant : ${data.focus?'oui':'non'}. Blocage : ${data.blocage||'aucun renseigné'}. Attente : ${data.attente_de||'aucune renseignée'}.\n`);
    new Notice('Organisation enregistrée. Déplacer les cartes pour mettre à jour l’avancement.');
   }finally{this.busy=false;}
  }).open();
 }
 renderDashboard(el,source,sourcePath,state){
  el.empty();el.addClass('wb-dashboard');
  const opts=frontmatter('---\n'+source+'\n---');
  const target=opts.personne?this.resolve(opts.personne,sourcePath,state.root):'';
  let rows=state.tickets;
  if(opts.personne)rows=rows.filter(t=>t.fm.responsable&&this.resolve(t.fm.responsable,t.file.path,state.root)===target);
  if(opts.scope==='sans_responsable')rows=rows.filter(t=>!clean(t.fm.responsable));
  const active=rows.filter(t=>t.result.status!=='Terminé'),done=rows.filter(t=>t.result.status==='Terminé');
  const rank=t=>(t.fm.focus===true?0:1)*100+(t.fm.priorite==='P1'?1:t.fm.priorite==='P2'?2:t.fm.priorite==='P3'?3:4);
  active.sort((a,b)=>rank(a)-rank(b)||(dateValue(a.fm.echeance)||'9999').localeCompare(dateValue(b.fm.echeance)||'9999')||String(a.fm.id).localeCompare(String(b.fm.id),undefined,{numeric:true}));
  const link=(parent,path,label)=>{const a=parent.createEl('a',{text:label,cls:'internal-link',attr:{href:path,'data-href':path}});a.onclick=e=>{e.preventDefault();this.app.workspace.openLinkText(path,sourcePath);};return a;};
  const counts=el.createDiv({cls:'wb-summary'});
  for(const [n,label]of [[active.length,'ouverts'],[active.filter(t=>t.fm.focus===true).length,'à faire maintenant'],[active.filter(t=>t.fm.blocage||t.fm.attente_de).length,'bloqués ou en attente'],[done.length,'terminés']]){const cell=counts.createDiv();cell.createEl('strong',{text:String(n)});cell.createEl('span',{text:label});}
  el.createEl('p',{text:'Mis à jour à la lecture des tickets et des Kanbans. Une attribution désigne le prochain résultat à livrer.',cls:'wb-caption'});
  if(!active.length)el.createEl('p',{text:'Aucun ticket ouvert attribué. Choisir un sujet dans « À attribuer » et utiliser « Organiser ». Ce message ne signifie pas que la personne n’a aucun travail.'});
  const filter=el.createEl('input',{attr:{type:'search',placeholder:'Rechercher un ticket ou une action','aria-label':'Rechercher dans le tableau de bord'}});filter.classList.add('wb-search');
  const content=el.createDiv();
  const render=()=>{
   content.empty();const query=filter.value.toLocaleLowerCase('fr');
   const filtered=active.filter(t=>[t.file.basename,t.action,t.fm.blocage,t.fm.attente_de].join(' ').toLocaleLowerCase('fr').includes(query));
   const sections=[['À faire maintenant',t=>t.fm.focus===true&&!t.fm.blocage&&!t.fm.attente_de],['À prendre ensuite',t=>t.fm.focus!==true&&!t.fm.blocage&&!t.fm.attente_de],['Bloqués et validations attendues',t=>t.fm.blocage||t.fm.attente_de]];
   for(const [title,predicate]of sections){const group=filtered.filter(predicate);if(!group.length)continue;content.createEl('h3',{text:title+' · '+group.length});
    for(const t of group){const row=content.createDiv({cls:'wb-task'}),heading=row.createDiv({cls:'wb-task-heading'});link(heading,t.file.path,t.file.basename);
     const button=heading.createEl('button',{text:'Organiser',attr:{'aria-label':'Organiser '+t.fm.id}});button.onclick=()=>this.dashboardDialog(t.file);
     row.createEl('p',{text:t.action||'Prochaine action à préciser',cls:'wb-action'});
     const due=dateValue(t.fm.echeance),overdue=validDate(due)&&due<localDate();
     row.createEl('p',{text:[t.fm.priorite||'Priorité à préciser',due?(validDate(due)?(overdue?'Échéance dépassée : ':'Échéance : ')+due:'Échéance invalide : '+due):'Sans échéance fixée',t.result.status, t.fm.responsable?clean(t.fm.responsable).split('/').pop():'À attribuer'].join(' · '),cls:'wb-caption'});
     const stages=row.createDiv({cls:'wb-stages'});for(const stage of t.result.stages)link(stages,stage.workflow,stage.workflow.split('/').pop().replace(/\.md$/,'')+' : '+stage.column);
     if(t.fm.blocage)row.createEl('p',{text:'Blocage : '+t.fm.blocage,cls:'mod-warning'});
     if(t.fm.attente_de)row.createEl('p',{text:'Attente : '+t.fm.attente_de});
     for(const error of t.result.errors)row.createEl('p',{text:error,cls:'mod-warning'});
    }
   }
   if(query&&!filtered.length)content.createEl('p',{text:'Aucun ticket ne correspond à cette recherche.'});
   if(done.length){const details=content.createEl('details');details.createEl('summary',{text:'Terminés · '+done.length});for(const t of done)link(details.createEl('p'),t.file.path,t.file.basename);}
  };filter.oninput=render;render();
 }

 async createDialog(){
  const source=this.app.workspace.getActiveFile()?.path||'',state=await this.snapshot(source),data={title:'',project:state.projects[0]?.file.path,workflows:[],permanent:false};
  if(!data.project){new Notice('Créer un projet avant un ticket.');return;}
  new Form(this.app,'Créer un ticket',form=>{
   const title=form.createEl('input',{attr:{placeholder:'Titre du ticket',required:true}});title.oninput=()=>data.title=title.value;
   const sel=form.createEl('select');for(const p of state.projects)sel.createEl('option',{text:p.file.basename,attr:{value:p.file.path}});sel.onchange=()=>data.project=sel.value;
   const permanent=form.createEl('label',{text:' Ticket permanent '});const check=permanent.createEl('input',{attr:{type:'checkbox'}});check.onchange=()=>data.permanent=check.checked;
   form.createEl('p',{text:'Workflows concernés'});
   for(const [path,b]of state.boards){const label=form.createEl('label',{text:b.file.basename+' '});const cb=label.createEl('input',{attr:{type:'checkbox'}});cb.onchange=()=>{data.workflows=cb.checked?[...data.workflows,path]:data.workflows.filter(x=>x!==path);};form.createEl('br');}
  },async()=>{if(this.busy)throw Error('Une opération Workflow Boards est déjà en cours.');this.busy=true;try{await this.createTicket(data,state.root);}finally{this.busy=false;}}).open();
 }
 async createTicket(data,root){
  const title=data.title.trim();if(!title||/[\\/:*?"<>|\[\]#\n\r]/.test(title))throw Error('Titre vide ou caractères interdits.');
  if(!data.workflows.length)throw Error('Choisir au moins un workflow.');
  if(new Set(data.workflows).size!==data.workflows.length)throw Error('Workflow dupliqué.');
  if(root!==this.root())throw Error('La configuration a changé. Rouvrir le formulaire.');
  const latest=await this.snapshot();const settings=await this.loadData()||{};let max=Number(settings.lastTicketId)||0;for(const t of latest.tickets){const m=String(t.fm.id).startsWith(this.settings.idPrefix)?String(t.fm.id).slice(this.settings.idPrefix.length).match(/^(\d+)$/):null;if(m)max=Math.max(max,Number(m[1]));}
  const id=this.settings.idPrefix+String(max+1).padStart(3,'0'),path=root+this.folder('tickets')+`${id} - ${title}.md`;
  const rel=p=>p.slice(root.length).replace(/\.md$/,'');
  if(!latest.projects.some(p=>p.file.path===data.project)||data.workflows.some(p=>!latest.boards.has(p)))throw Error('Projet ou workflow hors configuration.');
  const boardFiles=data.workflows.map(p=>this.app.vault.getAbstractFileByPath(p));if(boardFiles.some(x=>!x))throw Error('Workflow introuvable.');
  const fields={type:this.settings.types.ticket,id,projet:'[['+rel(data.project)+']]',permanent:data.permanent,qualification:'a_qualifier',workflows:data.workflows.map(p=>'[['+rel(p)+']]')};
  const yaml=Object.entries(fields).map(([key,value])=>JSON.stringify(this.settings.properties[key]||key)+': '+JSON.stringify(value)).join('\n');
  const content=`---\n${yaml}\n---\n\n# ${title}\n\n## Résultat attendu\n\nÀ préciser.\n\n## Travaux\n\n- [ ] Qualifier le résultat attendu.\n\n## ${this.settings.journalHeading}\n\n### ${localDate()}\n\nTicket créé.\n`;

  for(const b of boardFiles){const text=await this.app.vault.read(b);if(!parseBoard(text).columns.length)throw Error('Workflow sans colonne.');}
  if(!this.app.vault.getAbstractFileByPath(data.project))throw Error('Projet introuvable.');
  this.settings.lastTicketId=max+1;await this.saveData(this.settings);
  const file=await this.app.vault.create(path,content);
  for(const board of boardFiles)await this.app.vault.process(board,text=>insertCard(text,rel(path)));
  await this.app.workspace.getLeaf(false).openFile(file);new Notice('Ticket '+id+' créé.');
 }
 async journalDialog(){
  const file=this.app.workspace.getActiveFile();if(!file)return;const fm=this.fm(await this.app.vault.read(file));
  if(fm.type!==this.settings.types.ticket||fm.permanent!==true){new Notice('Ouvrir un ticket permanent.');return;}
  const root=this.root(file.path);if(!file.path.startsWith(root+this.folder('tickets'))){new Notice('Ticket hors du dossier configuré.');return;}
  const paths=list(fm.workflows).map(w=>this.resolve(w,file.path,root));let result='',selected=[];
  new Form(this.app,'Journaliser une exécution',form=>{
   const input=form.createEl('textarea',{attr:{placeholder:'Résultat de cette exécution et suites utiles',required:true}});input.oninput=()=>result=input.value;
   form.createEl('p',{text:'Workflows à relancer (laisser vide pour journaliser seulement)'});
   for(const path of paths){const l=form.createEl('label',{text:path.split('/').pop()+' '});const c=l.createEl('input',{attr:{type:'checkbox'}});c.onchange=()=>selected=c.checked?[...selected,path]:selected.filter(x=>x!==path);form.createEl('br');}
  },async()=>{
   if(!result.trim())throw Error('Renseigner le résultat.');
   if(this.busy)throw Error('Une opération Workflow Boards est déjà en cours.');this.busy=true;
   try{
    const before=await this.snapshot(file.path),ticket=before.tickets.find(t=>t.file.path===file.path);
    if(!ticket||ticket.result.errors.length)throw Error('Corriger les incohérences avant de relancer.');
    await this.app.vault.process(file,text=>text+(text.includes('## '+this.settings.journalHeading)?'':'\n## '+this.settings.journalHeading+'\n')+`\n### ${localDate()} - Exécution\n\n${result.trim()}\n\nÉtapes avant relance : ${ticket.result.stages.map(s=>s.workflow.split('/').pop()+': '+s.column).join(' ; ')}.\n\nRelance demandée : ${selected.map(s=>s.split('/').pop()).join(', ')||'aucune'}.\n`);
    for(const path of selected){const board=this.app.vault.getAbstractFileByPath(path);await this.app.vault.process(board,text=>{
     const parsed=parseBoard(text),matches=parsed.cards.filter(c=>this.resolve(c.target,path,root)===file.path);if(matches.length!==1)throw Error('Carte manquante ou dupliquée.');
     const lines=text.split(/\r?\n/);lines.splice(matches[0].line,1);return insertCard(lines.join('\n'),file.path.slice(root.length).replace(/\.md$/,''));
    });}
    new Notice('Exécution journalisée.');
   }finally{this.busy=false;}
  }).open();
 }
}
module.exports=Workflows;
module.exports.parseBoard=parseBoard;
module.exports.calculate=calculate;

module.exports.nextAction=nextAction;
module.exports.validDate=validDate;

module.exports.validateSettings=validateSettings;
module.exports.DEFAULT_SETTINGS=DEFAULT_SETTINGS;

module.exports.insertCard=insertCard;
