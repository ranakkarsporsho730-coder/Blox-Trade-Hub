import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// IMPORTANT: put your own Firebase Authentication UID here.
const ADMIN_UID = "PASTE_YOUR_ADMIN_UID_HERE";

// Deploy a compatible community-value API and put its base URL here.
// Expected endpoints: GET /info/fruits/{slug}, /info/gamepasses/{slug}, /info/limiteds/{slug}
// The community scraper project linked in README is one possible starting point.
const VALUE_API_BASE = "PASTE_YOUR_VALUE_API_BASE_URL_HERE".replace(/\/$/, "");

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const itemsRef = collection(db, "items");
let items = [];
let isAdmin = false;
let yourOffer = [];
let theirOffer = [];

const $ = id => document.getElementById(id);
const money = n => {
  const v = Number(n) || 0;
  if (v >= 1e9) return (v/1e9).toFixed(2).replace(/\.00$/,"")+"B";
  if (v >= 1e6) return (v/1e6).toFixed(2).replace(/\.00$/,"")+"M";
  if (v >= 1e3) return (v/1e3).toFixed(1).replace(/\.0$/,"")+"K";
  return String(v);
};
function parseValue(raw) {
  if (typeof raw === "number") return raw;
  const s = String(raw ?? "").trim().replace(/,/g,"").replace(/\$/g,"");
  const m = s.match(/^([\d.]+)\s*([KMB])?$/i);
  if (!m) return NaN;
  return Number(m[1]) * ({K:1e3,M:1e6,B:1e9}[String(m[2]||"").toUpperCase()] || 1);
}
function safeText(s){return String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function itemValue(item){return Number(item.value)||0;}
function updateSelects(){
  const list = items.filter(x => !x.category || ["fruit","gamepass","limited"].includes(x.category));
  for (const id of ["yourItem","theirItem"]) {
    const sel=$(id), old=sel.value;
    sel.innerHTML = list.map(x=>`<option value="${safeText(x.id)}">${safeText(x.name)} · ${money(itemValue(x))}</option>`).join("");
    if (list.some(x=>x.id===old)) sel.value=old;
  }
}
function renderItems(){
  const term=$("search").value.toLowerCase();
  const cat=$("categoryFilter").value;
  const filtered=items.filter(x=>(cat==="all"||x.category===cat)&&x.name.toLowerCase().includes(term));
  $("itemsGrid").innerHTML=filtered.map(x=>`<article class="item-card">
    ${x.image?`<img src="${safeText(x.image)}" alt="${safeText(x.name)}" loading="lazy" onerror="this.style.display='none'">`:""}
    <div class="name">${safeText(x.name)}</div><div class="value">${money(itemValue(x))}</div>
    <small>${safeText(x.category||"item")} · ${x.updatedAt?.toDate ? x.updatedAt.toDate().toLocaleDateString() : "value date unavailable"}</small>
  </article>`).join("") || "<p>No matching items yet.</p>";
  updateSelects();
  if(isAdmin) renderAdminItems();
}
function renderOffer(side, hostId, totalId){
  const total=side.reduce((sum,x)=>sum+itemValue(items.find(i=>i.id===x.id)||{})*x.qty,0);
  $(hostId).innerHTML=side.map((x,index)=>{
    const item=items.find(i=>i.id===x.id);
    return `<div class="chosen-row"><span>${safeText(item?.name||"Removed item")} × ${x.qty} <small>(${money(itemValue(item||{} )*x.qty)})</small></span><button type="button" data-remove="${index}" aria-label="Remove item">×</button></div>`;
  }).join("");
  $(totalId).textContent=money(total);
  return total;
}
function renderCalculator(){
  const a=renderOffer(yourOffer,"yourList","yourTotal");
  const b=renderOffer(theirOffer,"theirList","theirTotal");
  const diff=Math.abs(a-b), pct=Math.max(a,b)?diff/Math.max(a,b):0;
  $("verdict").textContent=!a&&!b?"Add items to compare the trade.":pct<=.10?"🟡 FAIR TRADE":a>b?"🟢 YOU WIN (value-wise)":"🔴 YOU LOSE (value-wise)";
  if(a||b) $("verdict").textContent += ` · Difference: ${money(diff)}`;
}
function addOffer(side, selectId){
  const id=$(selectId).value;if(!id)return;
  const found=side.find(x=>x.id===id);
  if(found)found.qty++;else side.push({id,qty:1});
  renderCalculator();
}
$("addYour").addEventListener("click",()=>addOffer(yourOffer,"yourItem"));
$("addTheir").addEventListener("click",()=>addOffer(theirOffer,"theirItem"));
$("yourList").addEventListener("click",e=>{const b=e.target.closest("[data-remove]");if(b){yourOffer.splice(Number(b.dataset.remove),1);renderCalculator();}});
$("theirList").addEventListener("click",e=>{const b=e.target.closest("[data-remove]");if(b){theirOffer.splice(Number(b.dataset.remove),1);renderCalculator();}});
$("search").addEventListener("input",renderItems);
$("categoryFilter").addEventListener("change",renderItems);

async function fetchExternalValue(category, slug){
  if(!VALUE_API_BASE || VALUE_API_BASE.includes("PASTE_")) throw new Error("Set VALUE_API_BASE_URL in app.js first.");
  const path=category==="fruit"?"fruits":category==="gamepass"?"gamepasses":"limiteds";
  const response=await fetch(`${VALUE_API_BASE}/info/${path}/${encodeURIComponent(slug)}`);
  if(!response.ok) throw new Error(`Value source returned HTTP ${response.status}`);
  const data=await response.json();
  if(data.message!=="found" || !data.value) throw new Error("Item not found by the value source.");
  const value=parseValue(data.value);
  if(!Number.isFinite(value)) throw new Error("Could not read the returned value.");
  return {value, demand:data.demand||"", trend:data.trend||"", source:"community API"};
}
async function refreshItem(item){
  if(!item.slug) throw new Error(`${item.name}: add a source slug first.`);
  const remote=await fetchExternalValue(item.category,item.slug);
  await updateDoc(doc(db,"items",item.id),{...remote,updatedAt:serverTimestamp()});
}
$("itemForm").addEventListener("submit",async e=>{
  e.preventDefault();if(!isAdmin)return;
  const name=$("itemName").value.trim(), category=$("itemCategory").value;
  const slug=$("itemSlug").value.trim().toLowerCase().replace(/\s+/g,"-");
  const manual=Number($("itemValue").value)||0;
  try{
    const ref=await addDoc(itemsRef,{name,category,image:$("itemImage").value.trim(),slug,value:manual,demand:"",source:manual?"manual fallback":"pending",updatedAt:serverTimestamp()});
    $("adminMessage").textContent="Item added. Fetching its latest community value…";
    const fresh={id:ref.id,name,category,slug,value:manual};
    try{await refreshItem(fresh);$("adminMessage").textContent="Added and value synced successfully.";}
    catch(err){$("adminMessage").textContent=`Added, but auto-sync failed: ${err.message} You can enter a manual value or check the API.`;}
    e.target.reset();
  }catch(err){$("adminMessage").textContent=err.message;}
});
$("refreshAll").addEventListener("click",async()=>{
  if(!isAdmin)return;
  $("adminMessage").textContent="Refreshing values…";
  let ok=0,fail=0;
  for(const item of items){try{await refreshItem(item);ok++;}catch(e){fail++;}}
  $("adminMessage").textContent=`Refresh finished: ${ok} updated, ${fail} failed.`;
});
function renderAdminItems(){
  $("adminItems").innerHTML=items.map(x=>`<div class="admin-item"><span>${safeText(x.name)} · ${money(itemValue(x))}</span><button type="button" data-delete="${safeText(x.id)}">Delete</button></div>`).join("");
}
$("adminItems").addEventListener("click",async e=>{
  const b=e.target.closest("[data-delete]");if(!b||!isAdmin)return;
  if(confirm("Delete this item?")) await deleteDoc(doc(db,"items",b.dataset.delete));
});
$("loginOpen").addEventListener("click",()=>$("loginPanel").classList.toggle("hidden"));
$("loginForm").addEventListener("submit",async e=>{
  e.preventDefault();
  try{await signInWithEmailAndPassword(auth,$("email").value,$("password").value);$("loginMessage").textContent="Signed in.";}
  catch(err){$("loginMessage").textContent=err.message;}
});
$("logout").addEventListener("click",()=>signOut(auth));
onAuthStateChanged(auth,user=>{
  isAdmin=!!user&&user.uid===ADMIN_UID;
  $("adminPanel").classList.toggle("hidden",!isAdmin);
  $("loginOpen").textContent=isAdmin?"Admin signed in":"Admin login";
  if(user&&!isAdmin) $("loginMessage").textContent="This account is not the configured admin.";
});
onSnapshot(query(itemsRef,orderBy("name")),snap=>{
  items=snap.docs.map(d=>({id:d.id,...d.data()}));
  $("syncStatus").textContent=`${items.length} items · synced with database`;
  renderItems();renderCalculator();
},err=>{$("syncStatus").textContent="Database connection error";console.error(err);});
