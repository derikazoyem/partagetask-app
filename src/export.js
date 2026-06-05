import { fmt } from './ui.js'

async function loadJsPDF() {
  if (window.jspdf) return window.jspdf.jsPDF
  await new Promise((res, rej) => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
    s.onload = res; s.onerror = rej
    document.head.appendChild(s)
  })
  return window.jspdf.jsPDF
}

async function loadXLSX() {
  if (window.XLSX) return window.XLSX
  await new Promise((res, rej) => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    s.onload = res; s.onerror = rej
    document.head.appendChild(s)
  })
  return window.XLSX
}

export async function exportPDF({ project, depenses, recettes, members, budgetMovements }) {
  try {
    const JsPDF  = await loadJsPDF()
    const d      = new JsPDF()
    const cur    = project.currency
    const n      = Object.keys(members).length || 1
    const totDep = depenses.reduce((s, t) => s + t.qty * t.price, 0)
    const totRec = recettes.reduce((s, r) => s + r.amount, 0)

    d.setFont('helvetica', 'bold'); d.setFontSize(18)
    d.text(`${project.name} — Rapport`, 14, 20)
    d.setFontSize(9); d.setFont('helvetica', 'normal'); d.setTextColor(120)
    d.text(`Exporté le ${new Date().toLocaleString('fr-FR')} · ${cur}`, 14, 28)
    d.setTextColor(0); d.setFont('helvetica', 'bold'); d.setFontSize(10)
    d.text(`Dépenses : ${fmt(totDep, cur)}   Recettes : ${fmt(totRec, cur)}`, 14, 38)
    d.setFont('helvetica', 'normal'); d.setFontSize(9)
    let y = 48

    // Dépenses
    d.setFont('helvetica', 'bold'); d.setFontSize(10); d.text('DÉPENSES', 14, y); y += 6
    d.setFont('helvetica', 'normal'); d.setFontSize(9)
    const dc = ['Description','Qté','Prix','Total','Auteur','Date']; const dw = [70,12,22,22,30,22]
    d.setFillColor(30,30,40); d.setTextColor(255)
    let x = 14; dc.forEach((c, i) => { d.rect(x, y, dw[i], 7, 'F'); d.text(c, x+2, y+5); x += dw[i] }); y += 7; d.setTextColor(0)
    depenses.forEach((t, idx) => {
      if (y > 265) { d.addPage(); y = 20 }
      const row = [t.desc, String(t.qty), fmt(t.price,cur), fmt(t.qty*t.price,cur), t.authorName||'', t.date]
      d.setFillColor(...(idx%2===0?[240,240,250]:[255,255,255]))
      x = 14; row.forEach((v, i) => { d.rect(x,y,dw[i],6,'F'); d.text(v.length>11&&i===0?v.substring(0,10)+'…':v,x+2,y+4); x+=dw[i] }); y+=6
    })
    d.setFillColor(200,200,220); x=14
    ['TOTAL','','',fmt(totDep,cur),'',''].forEach((v,i) => { d.rect(x,y,dw[i],6,'F'); if(v){d.setFont('helvetica','bold');d.text(v,x+2,y+4);d.setFont('helvetica','normal')} x+=dw[i] }); y+=12

    // Recettes
    if (y > 250) { d.addPage(); y = 20 }
    d.setFont('helvetica','bold'); d.setFontSize(10); d.text('RECETTES',14,y); y+=6
    d.setFont('helvetica','normal'); d.setFontSize(9)
    const rc=['Description','Montant','Auteur','Date']; const rw=[100,30,30,18]
    d.setFillColor(30,30,40); d.setTextColor(255); x=14
    rc.forEach((c,i)=>{d.rect(x,y,rw[i],7,'F');d.text(c,x+2,y+5);x+=rw[i]}); y+=7; d.setTextColor(0)
    recettes.forEach((r,idx) => {
      if (y>265){d.addPage();y=20}
      const row=[r.desc,fmt(r.amount,cur),r.authorName||'',r.date]
      d.setFillColor(...(idx%2===0?[230,250,240]:[255,255,255]))
      x=14; row.forEach((v,i)=>{d.rect(x,y,rw[i],6,'F');d.text(v.length>16&&i===0?v.substring(0,15)+'…':v,x+2,y+4);x+=rw[i]}); y+=6
    })
    d.setFillColor(180,220,200); x=14
    ['TOTAL',fmt(totRec,cur),'',''].forEach((v,i)=>{d.rect(x,y,rw[i],6,'F');if(v){d.setFont('helvetica','bold');d.text(v,x+2,y+4);d.setFont('helvetica','normal')}x+=rw[i]}); y+=12

    // Bilan
    if (y>240){d.addPage();y=20}
    d.setFont('helvetica','bold');d.setFontSize(10);d.text('BILAN INDIVIDUEL',14,y);y+=6
    d.setFont('helvetica','normal');d.setFontSize(9)
    const bc=['Membre','Budget','Rec.(÷N)','Dép.(÷N)','Solde']; const bw=[50,30,28,28,28]
    d.setFillColor(30,30,40);d.setTextColor(255);x=14
    bc.forEach((c,i)=>{d.rect(x,y,bw[i],7,'F');d.text(c,x+2,y+5);x+=bw[i]});y+=7;d.setTextColor(0)
    const uDep=totDep/n; const uRec=totRec/n
    Object.entries(members).forEach(([uid,m],idx)=>{
      const budget=(budgetMovements[uid]||[]).reduce((s,mv)=>s+mv.amount,0)
      const solde=budget+uRec-uDep
      d.setFillColor(...(idx%2===0?[245,245,255]:[255,255,255]))
      x=14;[m.displayName,fmt(budget,cur),fmt(uRec,cur),fmt(uDep,cur),(solde>=0?'+':'')+fmt(solde,cur)].forEach((v,i)=>{d.rect(x,y,bw[i],6,'F');d.text(v.substring(0,10),x+2,y+4);x+=bw[i]});y+=6
    })
    d.save(`${project.name}_rapport.pdf`)
  } catch (e) { console.error(e); throw e }
}

export async function exportExcel({ project, depenses, recettes, members, budgetMovements }) {
  const XLSX = await loadXLSX()
  const cur  = project.currency
  const n    = Object.keys(members).length || 1
  const totDep = depenses.reduce((s,t)=>s+t.qty*t.price,0)
  const totRec = recettes.reduce((s,r)=>s+r.amount,0)

  const dep = [['Description','Quantité','Prix unitaire','Total','Auteur','Date','Heure','Nb fichiers']]
  depenses.forEach(t=>dep.push([t.desc,t.qty,t.price,t.qty*t.price,t.authorName||'',t.date,t.time,(t.files||[]).length]))
  dep.push(['TOTAL GÉNÉRAL','','','',totDep,'','',''])

  const rec = [['Description','Montant','Auteur','Date','Heure']]
  recettes.forEach(r=>rec.push([r.desc,r.amount,r.authorName||'',r.date,r.time]))
  rec.push(['TOTAL',totRec,'','',''])

  const uDep=totDep/n; const uRec=totRec/n
  const bil = [['Membre','Budget total','Recettes (÷N)','Dépenses (÷N)','Solde net']]
  Object.entries(members).forEach(([uid,m])=>{
    const budget=(budgetMovements[uid]||[]).reduce((s,mv)=>s+mv.amount,0)
    bil.push([m.displayName,budget,uRec,uDep,budget+uRec-uDep])
  })

  const hist = [['Membre','Date','Heure','Mouvement','Note','Par','Solde après']]
  Object.entries(budgetMovements).forEach(([uid,mvs])=>{
    const name=members[uid]?.displayName||uid
    mvs.forEach(m=>hist.push([name,m.date,m.time,m.amount,m.note,m.modifiedBy,m.soldeApres]))
  })

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(dep),'Dépenses')
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rec),'Recettes')
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(bil),'Bilan')
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(hist),'Historique budgets')
  XLSX.writeFile(wb,`${project.name}_rapport.xlsx`)
}
