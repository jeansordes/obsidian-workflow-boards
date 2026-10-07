const {PluginSettingTab,Setting,Notice}=require('obsidian');
const DEFAULT_SETTINGS = {
 root: '',
 folders: {tickets:'Tasks', boards:'Boards', projects:'Projects', people:'People', campaigns:'Campaigns', deals:'Deals'},
 types: {ticket:'task', board:'workflow', project:'project', person:'person', organization:'organization', campaign:'campaign', deal:'deal'},
 properties: Object.fromEntries(Object.entries({type:'type',id:'id',projet:'project',permanent:'recurring',qualification:'qualification',workflows:'workflows',responsable:'owner',prochaine_action:'next_action',priorite:'priority',echeance:'due',focus:'focus',blocage:'blocker',attente_de:'waiting_for',campagne:'campaign',client:'client',contacts:'contacts',colonnes_gagnees:'won_columns',colonnes_perdues:'lost_columns',relance:'follow_up',montant:'amount',devise:'currency'})),
 completedColumns:['Done'], idPrefix:'T-', journalHeading:'Journal', currency:'EUR', lastTicketId:0
};
function validateSettings(input){
 const result={...DEFAULT_SETTINGS,...input};
 for(const section of ['folders','types','properties'])result[section]={...DEFAULT_SETTINGS[section],...input[section]};
 for(const value of [result.root,...Object.values(result.folders)]){
  if(typeof value!=='string'||value.startsWith('/')||value.includes('\\')||value.split('/').some(p=>p==='.'||p==='..')||/[\n\r:*?"<>|]/.test(value))throw Error('Folders must be relative vault paths without traversal.');
 }
 result.root=result.root.replace(/\/+$/,'');
 for(const key of Object.keys(result.folders)){result.folders[key]=result.folders[key].replace(/\/+$/,'');if(!result.folders[key])throw Error('Each folder must be set.');}
 for(const value of [...Object.values(result.properties),...Object.values(result.types)])if(typeof value!=='string'||!value.trim()||/[\n\r]/.test(value)||['__proto__','constructor','prototype'].includes(value))throw Error('Property names and types must be non-empty single-line strings.');
 if(new Set(Object.values(result.properties)).size!==Object.keys(result.properties).length)throw Error('Property mappings must be unique.');
 if(!Array.isArray(result.completedColumns)||!result.completedColumns.length||result.completedColumns.some(v=>typeof v!=='string'||!v.trim()||/[\r\n]/.test(v)))throw Error('At least one completed column is required.');
 if(typeof result.idPrefix!=='string'||!result.idPrefix||/[\\/:*?"<>|\[\]#\n\r]/.test(result.idPrefix))throw Error('Invalid task ID prefix.');
 if(typeof result.journalHeading!=='string'||!result.journalHeading.trim()||/[\r\n]/.test(result.journalHeading))throw Error('Invalid journal heading.');
 if(typeof result.currency!=='string'||!/^[A-Z]{3}$/.test(result.currency))throw Error('Use a three-letter currency code.');
 return result;
}
class WorkflowSettings extends PluginSettingTab {
 display(){
  const {containerEl}=this;containerEl.empty();
  containerEl.createEl('p',{text:'Configure folders and properties for this vault. Applying settings does not move or rewrite notes. Interface language: French; settings and property defaults: English.'});
  let draft=JSON.parse(JSON.stringify(this.plugin.settings));
  const add=(parent,key,label)=>new Setting(containerEl).setName(label).addText(text=>text.setValue(String(parent[key])).onChange(value=>{parent[key]=value;}));
  add(draft,'root','Workspace folder (empty for vault root)');
  new Setting(containerEl).setName('Folders').setHeading();
  for(const key of Object.keys(draft.folders))add(draft.folders,key,key);
  new Setting(containerEl).setName('Note types').setHeading();
  for(const key of Object.keys(draft.types))add(draft.types,key,key);
  new Setting(containerEl).setName('Properties').setHeading();
  for(const key of Object.keys(draft.properties))add(draft.properties,key,DEFAULT_SETTINGS.properties[key]);
  new Setting(containerEl).setName('Completion columns (one per line)').addTextArea(text=>text.setValue(draft.completedColumns.join('\n')).onChange(value=>{draft.completedColumns=value.split('\n').map(s=>s.trim()).filter(Boolean);}));
  add(draft,'idPrefix','Task ID prefix');add(draft,'journalHeading','Journal heading');add(draft,'currency','CRM currency');
  new Setting(containerEl).setName('Apply configuration').setDesc('Changes take effect when saved. Create configured folders before creating tasks.').addButton(button=>button.setButtonText('Save settings').setCta().onClick(async()=>{try{const previous=this.plugin.settings;draft.lastTicketId=previous.lastTicketId;this.plugin.settings=validateSettings(draft);try{await this.plugin.saveSettings();}catch(error){this.plugin.settings=previous;throw error;}new Notice('Settings saved.');}catch(error){new Notice(error.message);}}));
 }
 constructor(app,plugin){super(app,plugin);this.plugin=plugin;}
}


module.exports={DEFAULT_SETTINGS,validateSettings,WorkflowSettings};
