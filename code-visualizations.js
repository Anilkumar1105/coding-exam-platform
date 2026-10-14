import { db } from "./firebase-config.js";
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const builtIns = [
  {id:"bubble-sort",title:"Bubble Sort",topic:"Sorting",difficulty:"Beginner",description:"Watch adjacent values compare and swap until the array is sorted.",code:"arr = [5, 1, 4, 2, 8]\nfor i in range(len(arr)):\n    for j in range(0, len(arr) - i - 1):\n        if arr[j] > arr[j + 1]:\n            arr[j], arr[j + 1] = arr[j + 1], arr[j]",type:"sort"},
  {id:"binary-search",title:"Binary Search",topic:"Searching",difficulty:"Intermediate",description:"Follow low, high and mid as the search interval shrinks.",code:"arr = [2, 4, 7, 9, 12, 16, 21]\ntarget = 12\nlow, high = 0, len(arr) - 1\nwhile low <= high:\n    mid = (low + high) // 2\n    if arr[mid] == target: break\n    elif arr[mid] < target: low = mid + 1\n    else: high = mid - 1",type:"binary"},
  {id:"two-pointers",title:"Two Pointers: Find a Pair",topic:"Arrays & Strings",difficulty:"Intermediate",description:"Two pointers move inward to find a pair that matches the target sum.",code:"arr = [1, 2, 4, 6, 8, 9]\ntarget = 10\nleft, right = 0, len(arr) - 1\nwhile left < right:\n    total = arr[left] + arr[right]\n    if total == target: break\n    elif total < target: left += 1\n    else: right -= 1",type:"two"},
  {id:"stack",title:"Stack: LIFO",topic:"Data Structures",difficulty:"Beginner",description:"Explore push and pop operations. The last item pushed is the first item popped.",code:"stack = []\nstack.append(10)  # push\nstack.append(20)\nstack.append(30)\ntop = stack.pop()  # pop",type:"stack"},
  {id:"recursion",title:"Recursion: Factorial",topic:"Recursion",difficulty:"Intermediate",description:"See a recursive call descend to the base case and then return values.",code:"def factorial(n):\n    if n <= 1: return 1\n    return n * factorial(n - 1)\n\nprint(factorial(4))",type:"recursion"},
  {id:"linear-search",title:"Linear Search",topic:"Searching",difficulty:"Beginner",description:"Inspect each element in sequence until the target is found.",code:"arr = [8, 3, 6, 2, 9]\ntarget = 2\nfor i, value in enumerate(arr):\n    if value == target: break",type:"linear"}
];
const esc = (v="") => String(v).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const frames = {
  "bubble-sort": [[5,1,4,2,8],[1,5,4,2,8],[1,4,5,2,8],[1,4,2,5,8],[1,4,2,5,8],[1,2,4,5,8]],
  "binary-search": [[2,4,7,9,12,16,21],[2,4,7,9,12,16,21],[2,4,7,9,12,16,21]],
  "two-pointers": [[1,2,4,6,8,9],[1,2,4,6,8,9],[1,2,4,6,8,9]],
  "linear-search": [[8,3,6,2,9],[8,3,6,2,9],[8,3,6,2,9],[8,3,6,2,9]],
  "stack": [[10],[10,20],[10,20,30],[10,20]],
  "recursion": [[4],[4,3],[4,3,2],[4,3,2,1],[4,3,2],[4,3],[4],[24]]
};
const notes = {
  "bubble-sort": ["Start with the original array.","Compare 5 and 1. Swap because 5 is larger.","Compare 5 and 4. Swap the pair.","Compare 5 and 2. Move the largest value right.","The largest value is now at the end of this pass.","Repeat passes until values are sorted."],
  "binary-search": ["Search range is the full sorted array.","Middle value is 9. Target 12 is larger, so move low right.","Middle of the remaining range is 12: target found."],
  "two-pointers": ["Start at both ends: 1 + 9 = 10.","The sum equals the target. Pair found!","The pair is 1 and 9."],
  "linear-search": ["Check index 0: value 8 is not the target.","Check index 1: value 3 is not the target.","Check index 2: value 6 is not the target.","Check index 3: value 2 matches. Found!"],
  "stack": ["Push 10 onto the stack.","Push 20 on top of 10.","Push 30. It is now the top item.","Pop removes 30; last in, first out."],
  "recursion": ["factorial(4) waits for 4 × factorial(3).","factorial(3) waits for 3 × factorial(2).","factorial(2) waits for 2 × factorial(1).","Base case: factorial(1) returns 1.","Return 2 × 1 = 2.","Return 3 × 2 = 6.","Return 4 × 6 = 24.","Final result: 24."]
};

export function renderCodeVisualizations(root) {
  let programs = [...builtIns], selected = "bubble-sort", step = 0, timer = null, speed = 900, filter = "All", activeFrames = [];
  root.innerHTML = `<section class="cv-lab">
    <div class="cv-hero"><div><div class="cv-eyebrow">LEARN BY WATCHING</div><h2>Code Visualizations Lab</h2><p>Explore algorithms step by step. Watch values move, compare logic, and understand why the code works.</p></div><div class="cv-hero-icon">⌘</div></div>
    <div class="cv-toolbar"><div class="cv-search-wrap"><i class="bi bi-search"></i><input id="cvSearch" class="form-control" placeholder="Search algorithms, topics…" aria-label="Search visualizations"></div><select id="cvTopic" class="form-select" aria-label="Filter by topic"><option>All</option><option>Sorting</option><option>Searching</option><option>Arrays & Strings</option><option>Data Structures</option><option>Recursion</option></select></div>
    <div class="cv-layout"><aside class="cv-library"><div class="cv-section-label">VISUALIZATION LIBRARY</div><div id="cvCards" class="cv-cards"></div></aside>
    <div class="cv-workspace"><div class="cv-workspace-head"><div><span class="cv-topic" id="cvTopicBadge">SORTING</span><h3 id="cvTitle">Bubble Sort</h3><p id="cvDescription"></p><div id="cvProblem" class="cv-problem-panel"></div></div><span class="cv-difficulty" id="cvDifficulty"></span></div>
      <div class="cv-stage"><div class="cv-stage-top"><span><i class="bi bi-activity me-1"></i>LIVE VISUALIZATION</span><span id="cvStepLabel">Step 1</span></div><div id="cvCanvas" class="cv-canvas" aria-live="polite"></div><div id="cvNote" class="cv-note"></div></div>
      <div class="cv-controls"><button class="btn btn-outline-secondary" id="cvPrev"><i class="bi bi-skip-backward-fill me-1"></i>Previous</button><button class="btn btn-brand" id="cvPlay"><i class="bi bi-play-fill me-1"></i>Play</button><button class="btn btn-outline-secondary" id="cvNext">Next <i class="bi bi-skip-forward-fill ms-1"></i></button><button class="btn btn-outline-secondary" id="cvReset"><i class="bi bi-arrow-counterclockwise me-1"></i>Reset</button><label class="cv-speed">Speed <select id="cvSpeed" class="form-select form-select-sm"><option value="1400">0.5×</option><option value="900" selected>1×</option><option value="450">2×</option></select></label></div>
      <div class="cv-code-card"><div class="cv-code-head"><span><i class="bi bi-filetype-py me-2"></i>Python logic</span><span>READ ONLY</span></div><pre id="cvCode"></pre></div><div id="cvMedia" class="cv-media d-none"></div>
    </div></div><div class="cv-footer"><i class="bi bi-lightbulb me-2"></i>Tip: use <strong>Next</strong> to follow each state change, or <strong>Play</strong> to watch the full algorithm.</div></section>`;
  const $ = id => root.querySelector("#"+id);
  const stop = () => { if(timer) clearInterval(timer); timer=null; $("cvPlay").innerHTML='<i class="bi bi-play-fill me-1"></i>Play'; };
  function visiblePrograms(){ const q=$("cvSearch").value.toLowerCase(); return programs.filter(p=>(filter==="All"||p.topic===filter)&&[p.title,p.topic,p.description].join(" ").toLowerCase().includes(q)); }
  function renderCards(){const list=visiblePrograms(); $("cvCards").innerHTML=list.map(p=>`<button class="cv-card ${p.id===selected?'active':''}" data-id="${esc(p.id)}"><span class="cv-card-icon" aria-hidden="true"><i class="${iconFor(p.topic)}"></i></span><span class="cv-card-copy"><strong>${esc(p.title)}</strong><small>${esc(p.topic)} · ${esc(p.difficulty||"Beginner")}</small></span><i class="bi bi-chevron-right"></i></button>`).join("")||'<div class="text-muted small p-3">No visualizations match your search.</div>'; $("cvCards").querySelectorAll("[data-id]").forEach(b=>b.addEventListener("click",()=>{stop();selected=b.dataset.id;step=0;renderCards();renderActive();})); }
  function inferKind(p){
    const title=String(p.title||"").toLowerCase(), topic=String(p.topic||"").toLowerCase(), code=String(p.code||"").toLowerCase(), declared=String(p.type||"").toLowerCase();
    if(p.id && frames[p.id]) return p.id;
    if(/merge sort|quick sort|counting sort|heap sort|sort by frequency|sort.*array|sort.*string|sort.*character|sort.*word|sort.*date|sort.*pair|kth smallest|nearly sorted|sorted array/.test(title)) return "sorting";
    if(/bubble|selection sort|insertion sort|sorting/.test(title)) return "sorting";
    if(/binary search/.test(title)) return "binary-search";
    if(/two pointer|find a pair|target sum/.test(title)) return "two-pointers";
    if(/linear search/.test(title)) return "linear-search";
    if(/stack|lifo/.test(title)) return "stack";
    if(/factorial/.test(title)) return "factorial";
    if(/prime/.test(title)) return "prime";
    if(/palindrome/.test(title)) return "palindrome";
    if(/reverse.*number|number.*reverse/.test(title)) return "reverse-number";
    if(/print 1 to n|print numbers|counting/.test(title)) return "print-range";
    if(/sum.*first.*n|sum of.*natural/.test(title)) return "sum-range";
    if(/quotient|remainder/.test(title)) return "quotient";
    if(/count words|word count/.test(title)) return "word-count";
    if(/gcd|greatest common/.test(title)) return "gcd";
    if(/subtract two/.test(title)) return "subtract";
    if(/voting|eligible to vote/.test(title)) return "voting";
    if(/count.*character|character frequency/.test(title)) return "char-count";
    if(declared && declared!=="auto" && declared!=="bubble-sort" && declared!=="sort") return declared;
    if(/recursion/.test(topic) || /factorial/.test(code)) return "factorial";
    if(/sorting/.test(topic)) return "bubble-sort";
    if(/search/.test(topic)) return "linear-search";
    return "generic";
  }
  function makeProgramFrames(p){
    const kind=inferKind(p), title=String(p.title||"Program"), code=String(p.code||"Code example not provided."), framesOut=[];
    const add=(note,vars,output="Not produced yet",viz={})=>framesOut.push({note,vars,output,viz});
    const numeric=(v,fallback)=>{const n=Number(v);return Number.isFinite(n)?n:fallback;};
    const match=code.match(/(?:n|num|number)\s*=\s*(-?\d+)/i); const n=numeric(match?.[1],5);
    if(kind==="sorting") {
      const raw=String(p.exampleInput||p.input||"5 1 4 2 8").trim();
      let arr=raw.split(/[\\s,]+/).filter(Boolean).map(Number);
      if(!arr.length || arr.some(v=>!Number.isFinite(v))) arr=[5,1,4,2,8];
      const original=arr.slice(), name=title.toLowerCase();
      const addArray=(note,active=[],sorted=[],extra={})=>add(note,{array:arr.slice(),activeIndices:active,sortedIndices:sorted,...extra},sorted.length===arr.length?arr.join(" "):"Not produced yet",{kind:"array",values:arr.slice(),active,sorted});
      addArray(`Input array: ${original.join(", ")}. We will sort these values ${/descending/.test(name)?"from largest to smallest":"from smallest to largest"}.`);
      const cmp=(a,b)=>/descending/.test(name)?a<b:a>b;
      if(/merge sort/.test(name)){
        function mergeSort(a,lo=0,hi=a.length){
          if(hi-lo<=1)return a.slice(lo,hi);
          const mid=Math.floor((lo+hi)/2);
          addArray(`Split the array into left part [${a.slice(lo,mid).join(", ")}] and right part [${a.slice(mid,hi).join(", ")}].`,Array.from({length:hi-lo},(_,i)=>lo+i),[],{left:a.slice(lo,mid),right:a.slice(mid,hi)});
          const left=mergeSort(a,lo,mid), right=mergeSort(a,mid,hi), merged=[];
          let i=0,j=0;
          while(i<left.length&&j<right.length){const takeLeft=!cmp(left[i],right[j]);merged.push(takeLeft?left[i++]:right[j++]);addArray(`Merge step: compare the next left and right values. Temporary merged values: ${merged.join(", ")}.`,[],[],{left:left.slice(i),right:right.slice(j),merged:merged.slice()});}
          while(i<left.length)merged.push(left[i++]); while(j<right.length)merged.push(right[j++]);
          for(let k=0;k<merged.length;k++)a[lo+k]=merged[k];
          addArray(`Merge the section into sorted order: ${merged.join(", ")}.`,Array.from({length:hi-lo},(_,i)=>lo+i),[],{merged:merged.slice()});
          return merged;
        }
        mergeSort(arr);
      } else if(/selection sort/.test(name)){
        for(let i=0;i<arr.length-1;i++){let best=i;for(let j=i+1;j<arr.length;j++){addArray(`Compare ${arr[j]} with the current smallest value ${arr[best]}.`,[best,j]);if(cmp(arr[best],arr[j]))best=j;}[arr[i],arr[best]]=[arr[best],arr[i]];addArray(`Place ${arr[i]} into position ${i}.`,[i,best],Array.from({length:i+1},(_,k)=>k));}
      } else if(/insertion sort/.test(name)){
        for(let i=1;i<arr.length;i++){const key=arr[i];let j=i-1;addArray(`Take ${key} as the next value to insert into the sorted left side.`,[i]);while(j>=0&&cmp(arr[j],key)){arr[j+1]=arr[j];addArray(`Move ${arr[j]} one position to the right.`,[j,j+1],Array.from({length:i},(_,k)=>k));j--;}arr[j+1]=key;addArray(`Insert ${key} at index ${j+1}.`,[j+1],Array.from({length:i+1},(_,k)=>k));}
      } else if(/quick sort/.test(name)){
        function quick(lo,hi){if(lo>=hi)return;const pivot=arr[hi];let i=lo;addArray(`Choose ${pivot} as the pivot for this section.`,[hi]);for(let j=lo;j<hi;j++){addArray(`Compare ${arr[j]} with pivot ${pivot}.`,[j,hi]);if(!cmp(arr[j],pivot)){[arr[i],arr[j]]=[arr[j],arr[i]];i++;}}[arr[i],arr[hi]]=[arr[hi],arr[i]];addArray(`Place pivot ${pivot} in its final position.`,[i],[]);quick(lo,i-1);quick(i+1,hi);} quick(0,arr.length-1);
      } else {
        for(let i=0;i<arr.length;i++){let changed=false;for(let j=0;j<arr.length-i-1;j++){addArray(`Compare adjacent values ${arr[j]} and ${arr[j+1]}.`,[j,j+1],Array.from({length:i},(_,k)=>arr.length-1-k));if(cmp(arr[j],arr[j+1])){[arr[j],arr[j+1]]=[arr[j+1],arr[j]];changed=true;addArray(`Swap them: ${arr.join(", ")}.`,[j,j+1],Array.from({length:i},(_,k)=>arr.length-1-k));}}if(!changed)break;}
      }
      addArray(`Sorting complete. Final array: ${arr.join(", ")}.`,[],Array.from({length:arr.length},(_,i)=>i),{result:arr.slice()});
    }
    else if(kind==="factorial") { let acc=1; add(`Initialize factorial accumulator: fact = 1.`,{n, fact:acc}); for(let i=1;i<=Math.min(Math.max(1,n),12);i++){acc*=i;add(`Iteration ${i}: fact = fact × ${i} = ${acc}.`,{n,i,fact:acc},{value:acc,display:String(acc)},{kind:"math",expression:`${i}!`,value:acc});} add(`Finished: ${n}! = ${acc}.`,{n,fact:acc},String(acc),{kind:"result",value:acc}); }
    else if(kind==="prime") {const v=Math.max(2,n);add(`Check whether ${v} is prime. Start with divisor = 2.`,{n:v,divisor:2});let prime=true;for(let d=2;d*d<=v;d++){const rem=v%d;add(`Test ${v} % ${d} = ${rem}.`,{number:v,divisor:d,remainder:rem},"Checking",{kind:"division",a:v,b:d,remainder:rem});if(rem===0){prime=false;break;}}add(`${v} is ${prime?"prime":"not prime"}.`,{number:v,isPrime:prime},prime?"Prime":"Not prime",{kind:"result",value:prime?"Prime":"Not prime"}); }
    else if(kind==="palindrome"||kind==="reverse-number"){const v=Math.abs(numeric(code.match(/(?:n|num|number)\s*=\s*(-?\d+)/i)?.[1],121));let x=v,rev=0;add(`Start with ${v}; reversed value is 0.`,{number:v,remaining:x,reversed:rev});while(x>0&&framesOut.length<14){const digit=x%10;rev=rev*10+digit;x=Math.floor(x/10);add(`Take last digit ${digit}; reversed = ${rev}.`,{remaining:x,digit,reversed:rev},{value:rev,display:String(rev)},{kind:"digits",remaining:x,reversed:rev,digit});}if(kind==="palindrome"){const yes=rev===v;add(`${rev} ${yes?"equals":"does not equal"} ${v}: ${yes?"palindrome":"not a palindrome"}.`,{number:v,reversed:rev,isPalindrome:yes},yes?"Palindrome":"Not palindrome",{kind:"result",value:yes?"Palindrome":"Not palindrome"});}else add(`Reversed number = ${rev}.`,{number:v,reversed:rev},String(rev),{kind:"result",value:rev});}
    else if(kind==="print-range"||kind==="sum-range"){const end=Math.min(Math.max(1,n),30);let sum=0;add(`Initialize i = 1${kind==="sum-range"?", total = 0":""}.`,{i:1,...(kind==="sum-range"?{total:0}:{})});for(let i=1;i<=end;i++){sum+=i;add(kind==="sum-range"?`Add ${i}: total = ${sum}.`:`Print ${i}.`,{i,...(kind==="sum-range"?{total:sum}:{})},kind==="print-range"?String(i):"Not produced yet",{kind:"counter",current:i,total:kind==="sum-range"?sum:undefined});}add(kind==="sum-range"?`Sum of 1 to ${end} is ${sum}.`:`Finished printing 1 to ${end}.`,{n:end,...(kind==="sum-range"?{total:sum}:{})},kind==="sum-range"?String(sum):Array.from({length:end},(_,i)=>i+1).join(", "),{kind:"result",value:kind==="sum-range"?sum:`1 … ${end}`});}
    else if(kind==="quotient"){const nums=[...(code.match(/\b\d+\b/g)||[])].map(Number);const a=nums.length>1?nums[0]:17,b=nums.length>2?nums[1]:5;add(`Divide ${a} by ${b}.`,{dividend:a,divisor:b});add(`Quotient = ${Math.floor(a/b)}; remainder = ${a%b}.`,{dividend:a,divisor:b,quotient:Math.floor(a/b),remainder:a%b},`${Math.floor(a/b)}, ${a%b}`,{kind:"result",value:`q=${Math.floor(a/b)}, r=${a%b}`});}
    else if(kind==="word-count"){const sample=(p.exampleInput||p.input||"Python makes coding easier").toString();const words=sample.trim().split(/\s+/).filter(Boolean);add("Read the sentence and split it on whitespace.",{sentence:sample});words.forEach((w,i)=>add(`Word ${i+1}: ${w}`,{word:w,index:i+1,count:i+1},"Counting words",{kind:"word",value:w}));add(`Total words = ${words.length}.`,{sentence:sample,wordCount:words.length},String(words.length),{kind:"result",value:words.length});}
    else if(kind==="gcd"){const nums=[...(code.match(/\b\d+\b/g)||[])].map(Number);let a=nums.length>1?nums[0]:48,b=nums.length>2?nums[1]:18;add(`Start with a = ${a}, b = ${b}.`,{a,b});while(b!==0&&framesOut.length<14){const r=a%b;add(`${a} % ${b} = ${r}; replace a with b and b with remainder.`,{a,b,remainder:r},{value:r,display:String(r)},{kind:"division",a,b,remainder:r});a=b;b=r;}add(`GCD = ${a}.`,{gcd:a},String(a),{kind:"result",value:a});}
    else if(kind==="subtract"){const nums=[...(code.match(/\b\d+\b/g)||[])].map(Number);const a=nums.length>1?nums[0]:15,b=nums.length>2?nums[1]:7;add(`Read a = ${a} and b = ${b}.`,{a,b});add(`${a} - ${b} = ${a-b}.`,{a,b,result:a-b},String(a-b),{kind:"result",value:a-b});}
    else if(kind==="voting"){const age=numeric(code.match(/(?:age)\s*=\s*(\d+)/i)?.[1],18);add(`Read age = ${age}.`,{age});add(`Check age >= 18: ${age>=18}.`,{age,eligible:age>=18},age>=18?"Eligible to vote":"Not eligible",{kind:"result",value:age>=18?"Eligible":"Not eligible"});}
    else if(kind==="char-count"){const sample=(p.exampleInput||p.input||"banana").toString();const chars={};for(const ch of sample){chars[ch]=(chars[ch]||0)+1;add(`Read character '${ch}'; its count is ${chars[ch]}.`,{character:ch,frequency:chars[ch],counts:{...chars}},"Counting characters",{kind:"character",value:ch});}add("Character frequency table is complete.",{counts:chars},JSON.stringify(chars),{kind:"result",value:chars});}
    else if(kind==="generic"){const lines=code.split("\n").filter(l=>l.trim());const loopLine=lines.find(l=>/for\s+\w+\s+in\s+range\s*\(/.test(l));const loopN=Number(loopLine?.match(/range\s*\(\s*(\d+)/)?.[1]||n);add("Program initialized. Review the first executable statement.",{program:title,step:0});if(loopLine){for(let i=0;i<Math.min(Math.max(loopN,1),20);i++)add(`Loop iteration ${i+1}: variable i = ${i}.`,{i,iteration:i+1,totalIterations:Math.min(Math.max(loopN,1),20)},"Loop running",{kind:"counter",current:i+1});}else lines.slice(0,10).forEach((line,i)=>add(`Step ${i+1}: ${line.trim()}`,{line:line.trim(),lineNumber:i+1},"See current variables in this step."));add("Visualization finished. Compare the final state with the expected output.",{status:"complete"},"Completed",{kind:"result",value:"Done"});}
    else {const vals=frames[kind]||frames[p.id];if(vals){const ns=notes[kind]||notes[p.id]||[];vals.forEach((arr,i)=>add(ns[i]||`Step ${i+1}`,{array:arr},"",{kind:"array",values:arr}));}else add("Program ready.",{program:title},"Ready");}
    let customSteps=p.visualizationSteps;
    if(typeof customSteps==="string"){try{customSteps=JSON.parse(customSteps);}catch{customSteps=null;}}
    if(Array.isArray(customSteps) && customSteps.length && kind!=="sorting" && customSteps.some(x=>x && (x.variables||x.vars||x.visualization||x.output))) {framesOut.length=0;customSteps.forEach((raw,i)=>{const item=typeof raw==="string"?{note:raw}:raw;add(item.note||item.description||`Custom step ${i+1}`,item.variables||item.vars||{},item.output||"",item.visualization||{});});}
    if(typeof p.steps==="string"&&p.steps.trim()){try{const parsed=JSON.parse(p.steps);if(Array.isArray(parsed)){framesOut.length=0;parsed.forEach((item,i)=>add(item.note||item.description||`Custom step ${i+1}`,item.variables||item.vars||{},item.output||"",item.visualization||{}));}}catch{}}
    const expected=String(p.expectedOutput??p.expectedoutput??p.sampleOutput??"").trim();
    if(expected && framesOut.length){
      const last=framesOut[framesOut.length-1];
      if(!String(last.output??"").trim() || ["Completed","Ready","Not produced yet","Loop running"].includes(String(last.output).trim())) last.output=expected;
      if(last.vars && !Object.prototype.hasOwnProperty.call(last.vars,"expectedOutput")) last.vars.expectedOutput=expected;
    }
    return framesOut.length?framesOut:[{note:"No steps could be generated for this program yet.",vars:{program:title},output:expected||"Add code or custom visualization steps in the admin Excel file."}];
  }
  function renderGenericFrame(frame,p){
    const vars=frame.vars||{}; const viz=frame.viz||{}; let visual="";
    if(viz.kind==="array"&&Array.isArray(viz.values)){const max=Math.max(...viz.values.map(v=>Math.abs(Number(v))),1);const active=viz.active||[];const sorted=viz.sorted||[];visual=`<div class="cv-bars">${viz.values.map((v,i)=>`<div class="cv-bar-column"><div class="cv-bar-value">${esc(v)}</div><div class="cv-bar ${active.includes(i)?"cv-bar-active":""} ${sorted.includes(i)?"sorted":""}" style="height:${Math.max(24,Math.abs(Number(v))/max*155)}px"></div><span class="cv-bar-index">${i}</span></div>`).join("")}</div><div class="cv-state-caption">Highlighted bars are being compared or updated.</div>`;}
    else if(viz.kind==="counter") visual=`<div class="cv-generic-metric"><small>Current iteration</small><strong>${esc(viz.current??vars.i??vars.iteration??"—")}</strong>${viz.totalIterations?`<span>of ${esc(viz.totalIterations)}</span>`:""}</div>`;
    else if(viz.kind==="digits") visual=`<div class="cv-generic-metric"><small>Digit processing</small><strong>${esc(viz.digit)}</strong><span>Reversed so far: ${esc(viz.reversed)}</span><span>Remaining: ${esc(viz.remaining)}</span></div>`;
    else if(viz.kind==="division") visual=`<div class="cv-generic-metric"><strong>${esc(viz.a)} ÷ ${esc(viz.b)}</strong><span>Remainder: ${esc(viz.remainder)}</span></div>`;
    else if(viz.kind==="math") visual=`<div class="cv-generic-metric"><small>Running calculation</small><strong>${esc(viz.expression)}</strong><span>Result so far: ${esc(viz.value)}</span></div>`;
    else if(viz.kind==="character"||viz.kind==="word") visual=`<div class="cv-generic-metric"><small>${viz.kind==="word"?"Current word":"Current character"}</small><strong>${esc(viz.value)}</strong></div>`;
    else if(viz.kind==="result") visual=`<div class="cv-generic-metric cv-result"><small>Final result</small><strong>${esc(typeof viz.value==="object"?JSON.stringify(viz.value):viz.value)}</strong></div>`;
    else visual=`<div class="cv-variable-grid">${Object.entries(vars).map(([k,v])=>`<div class="cv-variable"><small>${esc(k)}</small><strong>${esc(typeof v==="object"?JSON.stringify(v):v)}</strong></div>`).join("")||'<div class="cv-variable"><small>State</small><strong>Initialized</strong></div>'}</div>`;
    const varsMarkup=`<div class="cv-variable-grid">${Object.entries(vars).map(([k,v])=>`<div class="cv-variable"><small>${esc(k)}</small><strong>${esc(typeof v==="object"?JSON.stringify(v):v)}</strong></div>`).join("")}</div>`;
    const code=String(p.code||"").split("\n"); const highlight=frame.vars?.lineNumber?Number(frame.vars.lineNumber)-1:-1;
    // Avoid rendering the same variable grid twice: the fallback visual already contains it.
    const hasInlineVariableGrid = visual.includes("cv-variable-grid");
    $("cvCanvas").innerHTML=`${visual}${varsMarkup && !hasInlineVariableGrid ? `<div class="cv-state-caption">Variable state</div>${varsMarkup}` : ""}`;
    $("cvCode").innerHTML=code.map((line,i)=>`<span class="cv-code-line ${i===highlight?'cv-code-current':''}">${esc(line)||" "}</span>`).join("\n")||"Code example not provided.";
    $("cvNote").textContent=frame.note||"Observe how the program state changes.";
    if(frame.output && frame.output!=="Not produced yet")$("cvNote").textContent+=` Output: ${typeof frame.output==="object"?(frame.output.display||JSON.stringify(frame.output.value??frame.output)):frame.output}`;
  }
  function expectedOutput(p){
    if(String(p.expectedOutput??p.expectedoutput??p.sampleOutput??"").trim()) return String(p.expectedOutput??p.expectedoutput??p.sampleOutput).trim();
    const title=String(p.title||"").toLowerCase(), input=String(p.exampleInput||p.input||"").trim();
    const nums=input.split(/[\\s,]+/).filter(Boolean).map(Number);
    if(/sort/.test(title)&&nums.length&&nums.every(Number.isFinite)){
      let a=nums.slice();
      if(/descending/.test(title))a.sort((x,y)=>y-x);
      else if(/absolute/.test(title))a.sort((x,y)=>Math.abs(x)-Math.abs(y));
      else a.sort((x,y)=>x-y);
      return a.join(" ");
    }
    if(/merge sort|quick sort|bubble sort|selection sort|insertion sort|heap sort|counting sort/.test(title)&&nums.length)return nums.sort((a,b)=>a-b).join(" ");
    if(/factorial/.test(title)){const n=Number(input||5);let r=1;for(let i=2;i<=Math.min(n,20);i++)r*=i;return String(r);}
    if(/palindrome/.test(title)){const v=input||"121";return String(v)===String(v).split("").reverse().join("")?"Palindrome":"Not palindrome";}
    if(/reverse.*number/.test(title))return String(input||"123").split("").reverse().join("");
    if(/prime/.test(title)){const n=Number(input||7);return n>1&&Array.from({length:Math.max(0,Math.floor(Math.sqrt(n))-1)},(_,i)=>i+2).every(d=>n%d!==0)?"Prime":"Not prime";}
    return p.expectedOutput||p.output||"See the final visualization step.";
  }
  function renderActive(){
    const p=programs.find(x=>x.id===selected)||programs[0]; if(!p)return; selected=p.id;
    const kind=inferKind(p); const known=!!(frames[kind]||frames[p.id]) && kind!=="sorting";
    $("cvTopicBadge").textContent=(p.topic||"Algorithms").toUpperCase(); $("cvTitle").textContent=p.title; $("cvDescription").textContent=p.description||"Follow the program state step by step."; $("cvDifficulty").textContent=p.difficulty||"Beginner";
    const sample=String(p.exampleInput||p.input||"Not provided");
    $("cvProblem").innerHTML=`<h4><i class="bi bi-book-half me-2"></i>Understand the problem</h4><p><strong>Your task:</strong> ${esc(p.description||("Write a Python program to solve "+p.title+"."))}</p><div class="cv-example-grid"><div><span>Sample input</span><pre>${esc(sample)}</pre></div><div><span>Expected output</span><pre>${esc(expectedOutput(p))}</pre></div></div><p class="cv-problem-tip"><i class="bi bi-lightbulb me-1"></i>Follow each step to see how the input changes into the output.</p>`;
    if(known){const key=frames[kind]?kind:p.id;activeFrames=(frames[key]||[]).map((arr,i)=>({note:(notes[key]||[])[i]||`Step ${i+1}`,vars:{array:arr},output:"",viz:{kind:key==="stack"?"stack":key==="recursion"?"recursion":"array",values:arr}}));}
    else activeFrames=makeProgramFrames(p);
    step=Math.max(0,Math.min(step,activeFrames.length-1));const frame=activeFrames[step]||{};
    $("cvStepLabel").textContent=`Step ${step+1} of ${activeFrames.length}`;
    if(known){
      const vals=frame.viz.values||[];
      if(kind==="stack"||kind==="recursion")renderGenericFrame(frame,p);
      else {const max=Math.max(...vals,1);$("cvCanvas").innerHTML=`<div class="cv-bars">${vals.map((v,i)=>`<div class="cv-bar-column"><div class="cv-bar-value">${esc(v)}</div><div class="cv-bar ${kind==="bubble-sort"&&step===activeFrames.length-1?'sorted':''}" style="height:${Math.max(24,Number(v)/max*155)}px"></div><span class="cv-bar-index">${i}</span></div>`).join("")}</div><div class="cv-state-caption">Array index is shown below each bar</div>`;$("cvCode").textContent=p.code||"Code example not provided.";$("cvNote").textContent=frame.note;}
    } else renderGenericFrame(frame,p);
    const media=p.mediaUrl||p.mediaURL||p.gifUrl||p.videoUrl||"";const box=$("cvMedia");if(media&&safeMedia(media)){box.classList.remove("d-none");const url=embedUrl(media);box.innerHTML=/\.(gif|webp|png|jpe?g)(\?.*)?$/i.test(url)?`<h6>Animation reference</h6><img loading="lazy" src="${esc(url)}" alt="${esc(p.title)} animation">`:`<h6>Video reference</h6><div class="ratio ratio-16x9"><iframe src="${esc(url)}" title="${esc(p.title)} video" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;}else{box.classList.add("d-none");box.innerHTML="";}
    $("cvPrev").disabled=step===0;$("cvNext").disabled=step===activeFrames.length-1;
  }
  function safeMedia(raw){try{const u=new URL(raw,location.href);return ["https:","http:"].includes(u.protocol)&&!u.username&&!u.password;}catch{return false;}}
  function embedUrl(raw){try{const u=new URL(raw);if(u.hostname.endsWith("youtu.be"))return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}`;if(u.hostname.includes("youtube.com")&&u.pathname==="/watch")return `https://www.youtube-nocookie.com/embed/${u.searchParams.get("v")}`;if(u.hostname.includes("youtube.com")&&u.pathname.startsWith("/embed/"))return `https://www.youtube-nocookie.com${u.pathname}`;if(u.hostname.includes("vimeo.com")&&!u.hostname.includes("player."))return `https://player.vimeo.com/video/${u.pathname.split('/').filter(Boolean).pop()}`;return u.href;}catch{return "";}}
  function iconFor(topic){return ({Sorting:"bi-bar-chart-steps",Searching:"bi-search", "Arrays & Strings":"bi-braces", "Data Structures":"bi-boxes",Recursion:"bi-diagram-3"})[topic]||"bi-code-slash";}
  $("cvPrev").addEventListener("click",()=>{stop();step--;renderActive();}); $("cvNext").addEventListener("click",()=>{stop();step++;renderActive();}); $("cvReset").addEventListener("click",()=>{stop();step=0;renderActive();}); $("cvPlay").addEventListener("click",()=>{if(timer){stop();return;}if(step>=activeFrames.length-1)step=0;$("cvPlay").innerHTML='<i class="bi bi-pause-fill me-1"></i>Pause';timer=setInterval(()=>{if(step>=activeFrames.length-1){stop();return;}step++;renderActive();$("cvPlay").innerHTML='<i class="bi bi-pause-fill me-1"></i>Pause';},speed);}); $("cvSpeed").addEventListener("change",e=>{speed=Number(e.target.value);if(timer){stop();$("cvPlay").click();}}); $("cvSearch").addEventListener("input",()=>{renderCards();const list=visiblePrograms();if(list.length&&!list.some(p=>p.id===selected)){selected=list[0].id;step=0;}renderActive();}); $("cvTopic").addEventListener("change",e=>{filter=e.target.value;renderCards();const list=visiblePrograms();if(list.length&&!list.some(p=>p.id===selected)){selected=list[0].id;step=0;}renderActive();});
  renderCards();renderActive();
  getDocs(query(collection(db,"codeVisualizations"),where("published","==",true))).then(snap=>{const remote=snap.docs.map(d=>({id:d.id,...d.data()}));if(remote.length){programs=[...builtIns,...remote];renderCards();if(!programs.some(p=>p.id===selected))selected=programs[0].id;renderActive();}}).catch(e=>console.warn("Could not load published visualizations; built-in demos remain available.",e));
}
