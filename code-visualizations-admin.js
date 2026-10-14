import { requireRole } from "./auth.js";
import { db } from "./firebase-config.js";
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = id => document.getElementById(id);
const collectionRef = collection(db, "codeVisualizations");
const safe = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let adminReady = false;
requireRole("admin", async () => { if (adminReady) return; adminReady = true; bind(); await loadPrograms(); });

function bind() {
  $("downloadVisualizationTemplateBtn")?.addEventListener("click", downloadTemplate);
  $("importVisualizationProgramsBtn")?.addEventListener("click", () => $("visualizationProgramsFile").click());
  $("visualizationProgramsFile")?.addEventListener("change", importFile);
}
function status(message, kind="info") { const el=$("visualizationImportStatus"); if(!el)return; el.className=`small mb-2 text-${kind}`; el.textContent=message; }
function downloadTemplate() {
  if (!window.XLSX) return status("Excel library did not load. Refresh the admin dashboard and try again.","danger");
  const headers=["title","topic","difficulty","description","code","type","published"];
  const sample=["Bubble Sort","Sorting","Beginner","Compare adjacent values and swap if needed.","arr = [5, 1, 4, 2, 8]\n# Add algorithm code here","bubble-sort","TRUE"];
  const wb=XLSX.utils.book_new(); const ws=XLSX.utils.aoa_to_sheet([headers,sample]);
  ws["!cols"]=[{wch:24},{wch:22},{wch:16},{wch:50},{wch:60},{wch:18},{wch:12}];
  XLSX.utils.book_append_sheet(wb,ws,"Visualization Programs");
  XLSX.writeFile(wb,"code-visualization-programs-template.xlsx");
}
function normalize(row){const out={};for(const [k,v] of Object.entries(row))out[String(k).toLowerCase().replace(/[^a-z0-9]/g,"")]=v;return out;}
function boolValue(v){return v===true || ["true","yes","1","published","active"].includes(String(v??"").trim().toLowerCase());}
async function importFile(event){const file=event.target.files?.[0];event.target.value="";if(!file)return;if(!window.XLSX)return status("Excel library did not load. Refresh the page.","danger");
  try { status("Reading Excel file…"); const wb=XLSX.read(await file.arrayBuffer(),{type:"array"});const rows=[];for(const sheet of wb.SheetNames){for(const raw of XLSX.utils.sheet_to_json(wb.Sheets[sheet],{defval:""})){const r=normalize(raw);if(!r.title)continue;const item={title:String(r.title).trim(),topic:String(r.topic||"Algorithms").trim(),difficulty:String(r.difficulty||"Beginner").trim(),description:String(r.description||"").trim(),code:String(r.code||"").trim(),type:String(r.type||"bubble-sort").trim(),published:boolValue(r.published),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};if(!item.title)continue;rows.push(item);}}
    if(!rows.length)throw new Error("No valid program rows found. Include a title column and at least one program row.");
    if(rows.length>300)throw new Error("Import is limited to 300 programs per file. Split the workbook into smaller files.");
    const preview=rows.slice(0,5).map(r=>`${r.title} (${r.topic})`).join(" · ");if(!confirm(`Import ${rows.length} visualization program(s) into the separate codeVisualizations collection?\n\n${preview}${rows.length>5?" · …":""}\n\nThis will not change existing coding questions or MCQs.`))return;
    status(`Importing ${rows.length} program(s)…`);let count=0;for(let i=0;i<rows.length;i+=400){const chunk=rows.slice(i,i+400);for(const item of chunk){await addDoc(collectionRef,item);count++;}}
    status(`Successfully imported ${count} program(s). Published programs are now available in Learning.`,"success");await loadPrograms();
  }catch(error){console.error("Visualization import failed",error);status(`Import failed: ${error.message||"Please check the file and Firestore permissions."}`,"danger");} }
async function loadPrograms(){const wrap=$("visualizationProgramsAdminList");if(!wrap)return;try{const snap=await getDocs(query(collectionRef,orderBy("createdAt","desc")));if(snap.empty){wrap.innerHTML='<span class="text-muted small">No custom programs imported yet. Built-in demos are already available to students.</span>';return;}wrap.innerHTML=snap.docs.map(d=>{const p=d.data();return `<div class="d-flex flex-wrap align-items-center justify-content-between gap-2 border rounded-3 p-3"><div><div class="fw-semibold">${safe(p.title||"Untitled program")}</div><div class="small text-muted">${safe(p.topic||"Algorithms")} · ${safe(p.difficulty||"Beginner")} · <span class="${p.published?'text-success':'text-secondary'}">${p.published?'Published':'Draft'}</span></div></div><div class="d-flex gap-2"><button class="btn btn-sm btn-outline-secondary" data-media-visual="${d.id}" data-media-url="${safe(p.mediaUrl||"")}">Media</button><button class="btn btn-sm btn-outline-primary" data-toggle-publish="${d.id}" data-published="${!!p.published}">${p.published?'Unpublish':'Publish'}</button><button class="btn btn-sm btn-outline-danger" data-delete-visual="${d.id}">Delete</button></div></div>`;}).join("");wrap.querySelectorAll("[data-media-visual]").forEach(b=>b.addEventListener("click",async()=>{const current=b.dataset.mediaUrl||"";const value=prompt("Optional direct GIF/image URL or embeddable YouTube/Vimeo URL. Leave blank to remove media:",current);if(value===null)return;const url=value.trim();if(url){try{const parsed=new URL(url);if(!["https:","http:"].includes(parsed.protocol)||parsed.username||parsed.password)throw new Error("Use a valid http(s) URL.");}catch(e){alert(e.message||"Enter a valid URL.");return;}}b.disabled=true;try{await updateDoc(doc(db,"codeVisualizations",b.dataset.mediaVisual),{mediaUrl:url||"",updatedAt:new Date().toISOString()});status("Media reference updated. It appears on the visualization page when published.","success");await loadPrograms();}catch(e){status(`Media update failed: ${e.message}`,"danger");b.disabled=false;}}));
  wrap.querySelectorAll("[data-toggle-publish]").forEach(b=>b.addEventListener("click",async()=>{b.disabled=true;try{await updateDoc(doc(db,"codeVisualizations",b.dataset.togglePublish),{published:b.dataset.published!=="true",updatedAt:new Date().toISOString()});status("Program visibility updated.","success");await loadPrograms();}catch(e){status(`Update failed: ${e.message}`,"danger");b.disabled=false;}}));wrap.querySelectorAll("[data-delete-visual]").forEach(b=>b.addEventListener("click",async()=>{if(!confirm("Permanently delete this visualization program?"))return;b.disabled=true;try{await deleteDoc(doc(db,"codeVisualizations",b.dataset.deleteVisual));status("Program deleted.","success");await loadPrograms();}catch(e){status(`Delete failed: ${e.message}`,"danger");b.disabled=false;}}));}catch(error){console.error(error);wrap.innerHTML='<span class="text-danger small">Could not load programs. Check Firestore rules for codeVisualizations.</span>';}}
