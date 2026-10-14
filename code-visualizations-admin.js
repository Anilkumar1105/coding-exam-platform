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
  $("downloadVisualizationProgramsBtn")?.addEventListener("click", downloadPrograms);
  $("importVisualizationProgramsBtn")?.addEventListener("click", () => $("visualizationProgramsFile").click());
  $("visualizationProgramsFile")?.addEventListener("change", importFile);
  $("selectAllVisualizationPrograms")?.addEventListener("change", event => {
    document.querySelectorAll("[data-select-visual-program]").forEach(cb => { cb.checked = event.target.checked; });
    updateBulkDeleteState();
  });
  $("deleteSelectedVisualizationProgramsBtn")?.addEventListener("click", deleteSelectedPrograms);
}
function status(message, kind="info") { const el=$("visualizationImportStatus"); if(!el)return; el.className=`small mb-2 text-${kind}`; el.textContent=message; }
function downloadTemplate() {
  if (!window.XLSX) return status("Excel library did not load. Refresh the admin dashboard and try again.","danger");
  const headers=["title","topic","difficulty","description","code","type","exampleInput","expectedOutput","visualizationSteps","mediaUrl","published"];
  const sample=["Factorial","Loops","Beginner","Calculate factorial using a loop.","n = 5\nfact = 1\nfor i in range(1, n + 1):\n    fact *= i\nprint(fact)","auto","5","120",JSON.stringify([{note:"Initialize fact = 1.",variables:{n:5,fact:1}},{note:"Iteration 1: fact = fact × 1 = 1.",variables:{n:5,i:1,fact:1}},{note:"Final result is 120.",variables:{n:5,fact:120},output:"120",visualization:{kind:"result",value:120}}]),"","TRUE"];
  const wb=XLSX.utils.book_new(); const ws=XLSX.utils.aoa_to_sheet([headers,sample]);
  ws["!cols"]=[{wch:24},{wch:22},{wch:16},{wch:50},{wch:60},{wch:20},{wch:18},{wch:20},{wch:70},{wch:42},{wch:12}];
  XLSX.utils.book_append_sheet(wb,ws,"Visualization Programs");
  XLSX.writeFile(wb,"code-visualization-programs-template.xlsx");
}
async function downloadPrograms() {
  if (!window.XLSX) return status("Excel library did not load. Refresh the admin dashboard and try again.", "danger");
  try {
    status("Preparing visualization programs export…");
    const snap = await getDocs(query(collectionRef, orderBy("createdAt", "desc")));
    const headers = ["title","topic","difficulty","description","code","type","exampleInput","expectedOutput","visualizationSteps","mediaUrl","published"];
    const rows = snap.docs.map(d => {
      const p = d.data();
      return headers.map(key => {
        const value = p[key];
        return value == null ? "" : (typeof value === "object" ? JSON.stringify(value) : value);
      });
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = [{wch:24},{wch:22},{wch:16},{wch:50},{wch:60},{wch:20},{wch:22},{wch:22},{wch:70},{wch:42},{wch:12}];
    XLSX.utils.book_append_sheet(wb, ws, "Visualization Programs");
    XLSX.writeFile(wb, "code-visualization-programs-export.xlsx");
    status(`Downloaded ${rows.length} visualization program(s).`, "success");
  } catch (error) {
    console.error("Visualization export failed", error);
    status(`Export failed: ${error.message || "Check Firestore permissions."}`, "danger");
  }
}
function normalize(row){const out={};for(const [k,v] of Object.entries(row))out[String(k).toLowerCase().replace(/[^a-z0-9]/g,"")]=v;return out;}
function boolValue(v){return v===true || ["true","yes","1","published","active"].includes(String(v??"").trim().toLowerCase());}
async function importFile(event){const file=event.target.files?.[0];event.target.value="";if(!file)return;if(!window.XLSX)return status("Excel library did not load. Refresh the page.","danger");
  try { status("Reading Excel file…"); const wb=XLSX.read(await file.arrayBuffer(),{type:"array"});const rows=[];for(const sheet of wb.SheetNames){for(const raw of XLSX.utils.sheet_to_json(wb.Sheets[sheet],{defval:""})){const r=normalize(raw);if(!r.title)continue;const item={title:String(r.title).trim(),topic:String(r.topic||"Algorithms").trim(),difficulty:String(r.difficulty||"Beginner").trim(),description:String(r.description||"").trim(),code:String(r.code||"").trim(),type:String(r.type||r.visualizationtype||"auto").trim(),exampleInput:String(r.exampleinput||r.sampleinput||r.input||"").trim(),expectedOutput:String(r.expectedoutput||r.sampleoutput||r.output||"").trim(),visualizationSteps:String(r.visualizationsteps||r.steps||"").trim(),mediaUrl:String(r.mediaurl||"").trim(),published:boolValue(r.published),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};if(!item.title)continue;rows.push(item);}}
    if(!rows.length)throw new Error("No valid program rows found. Include a title column and at least one program row.");
    if(rows.length>300)throw new Error("Import is limited to 300 programs per file. Split the workbook into smaller files.");
    // Skip programs that already exist by case-insensitive title + topic, and duplicate rows in this workbook.
    const existingSnap = await getDocs(collectionRef);
    const keyOf = item => `${String(item.title || "").trim().toLowerCase()}::${String(item.topic || "").trim().toLowerCase()}`;
    const existingKeys = new Set(existingSnap.docs.map(d => keyOf(d.data())));
    const workbookKeys = new Set();
    const uniqueRows = [];
    let duplicateCount = 0;
    for (const item of rows) {
      const key = keyOf(item);
      if (existingKeys.has(key) || workbookKeys.has(key)) { duplicateCount++; continue; }
      workbookKeys.add(key);
      uniqueRows.push(item);
    }
    if (!uniqueRows.length) {
      status(`Nothing imported: all ${rows.length} row(s) already exist by title and topic. Existing programs were not changed.`, "warning");
      await loadPrograms();
      return;
    }
    const preview = uniqueRows.slice(0, 5).map(r => `${r.title} (${r.topic})`).join(" · ");
    if (!confirm(`Import ${uniqueRows.length} new visualization program(s)?\n\n${preview}${uniqueRows.length > 5 ? " · …" : ""}\n\n${duplicateCount} duplicate row(s) will be skipped. Existing programs, MCQs, coding questions, marks, and learning progress will not be changed.`)) return;
    status(`Importing ${uniqueRows.length} new program(s)…`);
    let count = 0, failed = 0;
    for (const item of uniqueRows) {
      try { await addDoc(collectionRef, item); count++; }
      catch (writeError) { failed++; console.error("Could not import visualization program:", item.title, writeError); }
    }
    status(`Imported ${count} program(s); skipped ${duplicateCount} duplicate row(s)${failed ? `; ${failed} failed (see console)` : ""}.`, failed ? "warning" : "success");
    await loadPrograms();
  }catch(error){console.error("Visualization import failed",error);status(`Import failed: ${error.message||"Please check the file and Firestore permissions."}`,"danger");} }
function updateBulkDeleteState() {
  const checks = [...document.querySelectorAll("[data-select-visual-program]")];
  const selected = checks.filter(cb => cb.checked).length;
  const button = $("deleteSelectedVisualizationProgramsBtn");
  const count = $("selectedVisualizationProgramCount");
  const selectAll = $("selectAllVisualizationPrograms");
  if (button) button.disabled = selected === 0;
  if (count) count.textContent = `${selected} selected`;
  if (selectAll) {
    selectAll.checked = checks.length > 0 && selected === checks.length;
    selectAll.indeterminate = selected > 0 && selected < checks.length;
  }
}
async function deleteSelectedPrograms() {
  const selected = [...document.querySelectorAll("[data-select-visual-program]:checked")];
  if (!selected.length) return status("Select at least one program to delete.", "warning");
  const names = selected.map(cb => cb.dataset.programTitle || "Untitled program");
  const preview = names.slice(0, 6).join(", ") + (names.length > 6 ? ", …" : "");
  if (!confirm(`Permanently delete ${selected.length} selected visualization program(s)?\\n\\n${preview}\\n\\nThis cannot be undone. Only Code Visualizations programs will be deleted; MCQs, coding exam questions, exam results, learning progress, points, and streaks will not be changed.`)) return;
  const button = $("deleteSelectedVisualizationProgramsBtn");
  if (button) button.disabled = true;
  let deleted = 0;
  try {
    status(`Deleting ${selected.length} selected program(s)…`);
    for (const checkbox of selected) {
      await deleteDoc(doc(db, "codeVisualizations", checkbox.dataset.selectVisualProgram));
      deleted++;
    }
    status(`Successfully deleted ${deleted} visualization program(s).`, "success");
    await loadPrograms();
  } catch (error) {
    console.error("Bulk visualization deletion failed", error);
    status(`Deleted ${deleted} program(s), but deletion stopped: ${error.message || "Check Firestore permissions."}`, "danger");
    await loadPrograms();
  } finally {
    updateBulkDeleteState();
  }
}
async function loadPrograms(){const wrap=$("visualizationProgramsAdminList");if(!wrap)return;try{const snap=await getDocs(query(collectionRef,orderBy("createdAt","desc")));if(snap.empty){wrap.innerHTML='<span class="text-muted small">No custom programs imported yet. Built-in demos are already available to students.</span>';updateBulkDeleteState();return;}wrap.innerHTML=snap.docs.map(d=>{const p=d.data();return `<div class="d-flex flex-wrap align-items-center justify-content-between gap-2 border rounded-3 p-3"><div class="d-flex align-items-start gap-3"><input class="form-check-input mt-1" type="checkbox" aria-label="Select ${safe(p.title||"program")}" data-select-visual-program="${d.id}" data-program-title="${safe(p.title||"Untitled program")}"><div><div class="fw-semibold">${safe(p.title||"Untitled program")}</div><div class="small text-muted">${safe(p.topic||"Algorithms")} · ${safe(p.difficulty||"Beginner")} · <span class="${p.published?'text-success':'text-secondary'}">${p.published?'Published':'Draft'}</span></div></div></div><div class="d-flex gap-2 flex-wrap"><button class="btn btn-sm btn-outline-secondary" data-edit-visual="${d.id}" data-steps="${safe(p.visualizationSteps||"")}" data-type="${safe(p.type||"auto")}">Customize</button><button class="btn btn-sm btn-outline-secondary" data-media-visual="${d.id}" data-media-url="${safe(p.mediaUrl||"")}">Media</button><button class="btn btn-sm btn-outline-primary" data-toggle-publish="${d.id}" data-published="${!!p.published}">${p.published?'Unpublish':'Publish'}</button><button class="btn btn-sm btn-outline-danger" data-delete-visual="${d.id}">Delete</button></div></div>`;}).join("");
  wrap.querySelectorAll("[data-select-visual-program]").forEach(cb => cb.addEventListener("change", updateBulkDeleteState));
  const selectAll = $("selectAllVisualizationPrograms");
  if (selectAll) selectAll.checked = false;
  updateBulkDeleteState();
  wrap.querySelectorAll("[data-edit-visual]").forEach(b=>b.addEventListener("click",async()=>{const current=b.dataset.steps||"";const type=prompt("Visualization type: auto, factorial, prime, palindrome, reverse-number, print-range, sum-range, quotient, word-count, gcd, subtract, voting, char-count, bubble-sort, binary-search, two-pointers, linear-search, stack, recursion",b.dataset.type||"auto");if(type===null)return;const steps=prompt("Optional custom visualization steps as JSON array. Example: [{\"note\":\"Initialize total = 0\",\"variables\":{\"total\":0}},{\"note\":\"Final result\",\"variables\":{\"total\":10},\"output\":\"10\"}]. Leave blank to use automatic steps.",current);if(steps===null)return;if(steps.trim()){try{if(!Array.isArray(JSON.parse(steps)))throw new Error("Steps must be a JSON array.");}catch(e){alert(e.message||"Invalid JSON steps.");return;}}b.disabled=true;try{await updateDoc(doc(db,"codeVisualizations",b.dataset.editVisual),{type:type.trim()||"auto",visualizationSteps:steps.trim(),updatedAt:new Date().toISOString()});status("Visualization customization saved.","success");await loadPrograms();}catch(e){status(`Customization failed: ${e.message}`,"danger");b.disabled=false;}}));
  wrap.querySelectorAll("[data-media-visual]").forEach(b=>b.addEventListener("click",async()=>{const current=b.dataset.mediaUrl||"";const value=prompt("Optional direct GIF/image URL or embeddable YouTube/Vimeo URL. Leave blank to remove media:",current);if(value===null)return;const url=value.trim();if(url){try{const parsed=new URL(url);if(!["https:","http:"].includes(parsed.protocol)||parsed.username||parsed.password)throw new Error("Use a valid http(s) URL.");}catch(e){alert(e.message||"Enter a valid URL.");return;}}b.disabled=true;try{await updateDoc(doc(db,"codeVisualizations",b.dataset.mediaVisual),{mediaUrl:url||"",updatedAt:new Date().toISOString()});status("Media reference updated. It appears on the visualization page when published.","success");await loadPrograms();}catch(e){status(`Media update failed: ${e.message}`,"danger");b.disabled=false;}}));
  wrap.querySelectorAll("[data-toggle-publish]").forEach(b=>b.addEventListener("click",async()=>{b.disabled=true;try{await updateDoc(doc(db,"codeVisualizations",b.dataset.togglePublish),{published:b.dataset.published!=="true",updatedAt:new Date().toISOString()});status("Program visibility updated.","success");await loadPrograms();}catch(e){status(`Update failed: ${e.message}`,"danger");b.disabled=false;}}));wrap.querySelectorAll("[data-delete-visual]").forEach(b=>b.addEventListener("click",async()=>{if(!confirm("Permanently delete this visualization program?"))return;b.disabled=true;try{await deleteDoc(doc(db,"codeVisualizations",b.dataset.deleteVisual));status("Program deleted.","success");await loadPrograms();}catch(e){status(`Delete failed: ${e.message}`,"danger");b.disabled=false;}}));}catch(error){console.error(error);wrap.innerHTML='<span class="text-danger small">Could not load programs. Check Firestore rules for codeVisualizations.</span>';}}
