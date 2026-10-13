import {test,expect,type Page} from '@playwright/test';
const initialBrand={displayName:'Atelier Test',accentColor:'#496b50',logoUrl:'',textFont:'SANS',signatureFont:'SCRIPT',textColor:'#24352b',signatureColor:'#315b45',textSize:11,signatureSize:22};
async function setup(page:Page){
 let brand={...initialBrand};
 let contacts:{id:string;name:string;email:string;company:string;phone:string;notes:string}[]=[];
 await page.addInitScript(()=>localStorage.setItem('signeo_access_token','test-only-session'));
 await page.route('http://localhost:3001/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  const method=route.request().method();
  if(method==='OPTIONS'){await route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'}});return;}
  const reply=(json:unknown)=>route.fulfill({json,headers:{'Access-Control-Allow-Origin':'*'}});
  if(path==='/auth/me')return reply({name:'Camille Test',email:'camille@example.test',branding:brand,identityVerification:{status:'NOT_STARTED'},activeWorkspace:{id:'test',name:'Atelier',role:'ADMIN'},workspaces:[]});
  if(path==='/auth/branding'){brand=route.request().postDataJSON();return reply({branding:brand});}
  if(path==='/auth/sessions')return reply([{id:'session',label:'Navigateur web',current:true,createdAt:'2026-10-01T10:00:00Z',expiresAt:'2026-10-20T10:00:00Z'}]);
  if(path==='/billing')return reply({organization:{id:'org',name:'Atelier'},billingEmail:'',plan:'FREE',subscriptionStatus:'TRIAL',usage:{envelopesThisMonth:0,includedEnvelopesPerMonth:5}});
  if(path==='/contacts'&&method==='GET')return reply({items:contacts,canEdit:true});
  if(path==='/contacts'&&method==='POST'){const contact={id:'contact',...route.request().postDataJSON()};contacts.push(contact);return reply(contact);}
  if(path==='/contacts/contact'&&method==='PATCH'){const contact={id:'contact',...route.request().postDataJSON()};contacts=[contact];return reply(contact);}
  if(path==='/contacts/contact'&&method==='DELETE'){contacts=[];return reply({deleted:true});}
  if(path==='/envelopes')return reply([]);
  return reply({});
 });
 return ()=>brand;
}
test('preset changes, cancellation and save survive reload',async({page})=>{
 const saved=await setup(page);
 await page.goto('/dashboard/parametres');
 const save=page.getByRole('button',{name:'Enregistrer les modifications'});
 await expect(save).toBeDisabled();
 await page.getByRole('button',{name:/Éditorial/}).click();
 await expect(page.getByText('Modifications non enregistrées')).toBeVisible();
 await page.getByRole('button',{name:'Annuler',exact:true}).click();
 await expect(save).toBeDisabled();
 await page.getByRole('button',{name:/Studio Libre/}).click();
 await save.click();
 await expect(save).toBeDisabled();
 expect(saved().accentColor).toBe('#575080');
 await page.reload();
 await expect(page.getByRole('button',{name:/Studio Libre/})).toHaveAttribute('aria-pressed','true');
});
test('mobile preview and account tabs remain usable',async({page})=>{
 await setup(page);await page.goto('/dashboard/parametres');
 await page.getByRole('button',{name:'Mobile',exact:true}).click();
 await expect(page.getByRole('button',{name:'Mobile',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Agrandir l’aperçu'}).click();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('button',{name:'Agrandir l’aperçu'})).toHaveAttribute('aria-expanded','false');
 await page.getByRole('button',{name:/Compte & sécurité/}).click();
 await expect(page.getByLabel('Nom complet')).toHaveValue('Camille Test');
 await expect(page.getByText('Navigateur web · Cette session')).toBeVisible();
});
test('contact creation and update persist in the list',async({page})=>{
 await setup(page);await page.goto('/dashboard/contacts');
 await page.getByLabel('Nom complet').fill('Martin Test');
 await page.getByLabel('E-mail',{exact:true}).fill('martin@example.test');
 await page.getByRole('button',{name:'Enregistrer le contact'}).click();
 await expect(page.getByText('Contact enregistré.')).toBeVisible();
 await page.getByRole('button',{name:'Modifier',exact:true}).click();
 await page.getByLabel('Nom complet').fill('Martin Dupont');
 await page.getByRole('button',{name:'Enregistrer le contact'}).click();
 await page.getByLabel('Rechercher').fill('Dupont');
 await expect(page.getByText('Martin Dupont',{exact:true})).toBeVisible();
});
test('legal information is linked from signup',async({page})=>{
 await page.goto('/inscription');
 await expect(page.getByRole('link',{name:'conditions d’utilisation'})).toHaveAttribute('href','/conditions');
 await expect(page.getByRole('link',{name:'politique de confidentialité'})).toHaveAttribute('href','/confidentialite');
});
