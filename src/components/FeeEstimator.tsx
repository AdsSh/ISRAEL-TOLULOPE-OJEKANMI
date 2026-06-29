import React, { useState, useEffect } from 'react';
import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';
import { Info } from 'lucide-react';
import LoadingPage from './LoadingPage';
import { initAuth, googleSignIn, getAccessToken } from '../lib/auth';
import { User } from 'firebase/auth';


type Floor = { id: number; length: number; breadth: number; height: number; rate: number; blockCount: number };
type Building = { id: number; floors: Floor[] };

const roadmapData = {
  proposed: [
    { title: "0. Pre-submission", description: "Create EPPPS account, engage CAP, gather survey, C of O, drawings, Tax Clearance." },
    { title: "1. Online Application", description: "Fill application form, upload documents, pay initial processing fee." },
    { title: "2. LASPPPA Vetting", description: "District officers review, pay assessed fees via portal." },
    { title: "3. Permit Issuance", description: "Download digitally signed Planning Permit." },
    { title: "4. LASBCA Oversight", description: "Submit 'Letter of Intent', schedule inspections, upload structural insurance, request certifications." },
    { title: "5. Completion", description: "Final inspection, receive Certificate of Completion." }
  ],
  ongoing: [
    { title: "0. Regularization", description: "Submit 'as-built' drawings showing current state." },
    { title: "1. Assessment & Penalty", description: "Pay 2x Penalty assessment." },
    { title: "2. LASPPPA Vetting", description: "District officers review, site verification, pay assessed fees." },
    { title: "3. Permit Issuance", description: "Download digitally signed Planning Permit." },
    { title: "4. LASBCA Oversight", description: "Submit 'Letter of Intent', inspections, request certifications." },
    { title: "5. Completion", description: "Final inspection, receive Certificate of Completion." }
  ],
  asbuilt: [
    { title: "0. Regularization", description: "Submit comprehensive as-built drawings with structural verification." },
    { title: "1. Assessment & Penalty", description: "Pay 4x Penalty assessment (check for amnesty)." },
    { title: "2. LASPPPA Vetting", description: "District officers review, rigorous site verification, pay assessed fees." },
    { title: "3. Permit Issuance", description: "Download digitally signed Planning Permit." },
    { title: "4. LASBCA Oversight", description: "Submit 'Letter of Intent', inspections, request certifications." },
    { title: "5. Completion", description: "Final inspection, receive Certificate of Completion." }
  ]
};

const getRequiredDocuments = (devType: string, stage: string, buildings: Building[]) => {
  const universalDocs = [
    { name: "C of O / Governor’s Consent", mandatory: true },
    { name: "Certified Survey Plan", mandatory: true },
    { name: "Architectural Drawings", mandatory: true },
    { name: "Structural Drawings + Calculation Sheets", mandatory: true },
    { name: "Tax Clearance Certificate", mandatory: true },
    { name: "Means of Identification (ID)", mandatory: true },
  ];

  let dynamicDocs = [];

  // MEP and Structural Insurance based on floor height or type
  let totalFloors = 0;
  buildings.forEach(b => totalFloors += b.floors.length);
  
  if (['commercial', 'institutional', 'industrial', 'mixed'].includes(devType) || totalFloors > 2) {
    dynamicDocs.push({ name: "MEP Drawings", mandatory: false });
  }
  
  if (totalFloors > 2) {
    dynamicDocs.push({ name: "Structural Insurance / Builder’s All Risk", mandatory: false });
  }

  // Fire safety/signage
  if (['commercial', 'mixed', 'institutional'].includes(devType)) {
    dynamicDocs.push({ name: "Fire Safety & Signage Layout", mandatory: false });
  }

  // EIA
  if (['commercial', 'industrial', 'institutional', 'mixed'].includes(devType)) {
    dynamicDocs.push({ name: "Environmental Impact Assessment (EIA)", mandatory: false });
  }

  // Ongoing/As-built
  if (['ongoing', 'asbuilt'].includes(stage)) {
    dynamicDocs.push({ name: "Site Photographs (external & internal)", mandatory: true });
    dynamicDocs.push({ name: "Current Stage Structural Report", mandatory: true });
  }

  // As-built
  if (stage === 'asbuilt') {
    dynamicDocs.push({ name: "As-built drawings (Arch/Struct/MEP)", mandatory: true });
  }

  return [...universalDocs, ...dynamicDocs];
};

const FeeEstimator = () => {
  const [darkMode, setDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState<'manual' | 'land'>('manual');
  const [showCalculator, setShowCalculator] = useState(false);
  const [userInfo, setUserInfo] = useState({ name: '', email: '', phone: '' });
  const [devType, setDevType] = useState('residential');
  const [stage, setStage] = useState('proposed');
  const [currentPhase, setCurrentPhase] = useState(0);
  const [fencingArea, setFencingArea] = useState(0);
  const [residentialUnits, setResidentialUnits] = useState(1);
  const [lettableArea, setLettableArea] = useState(0);
  const [buildings, setBuildings] = useState<Building[]>([{ id: Date.now(), floors: [{ id: Date.now(), length: 0, breadth: 0, height: 3, rate: 200, blockCount: 1 }] }]);
  const [result, setResult] = useState<any>(null);
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({ message: '', visible: false });
  const [isLoading, setIsLoading] = useState(true);

  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);

  const toggleDarkMode = () => setDarkMode(!darkMode);

  const showToast = (message: string) => {
    setToast({ message, visible: true });
    setTimeout(() => setToast({ message: '', visible: false }), 3000);
  };

  const addBuilding = () => setBuildings([...buildings, { id: Date.now(), floors: [{ id: Date.now(), length: 0, breadth: 0, height: 3, rate: 200, blockCount: 1 }] }]);
  
  const addFloorToBuilding = (buildingId: number) => {
    setBuildings(buildings.map(b => b.id === buildingId ? { ...b, floors: [...b.floors, { id: Date.now(), length: 0, breadth: 0, height: 3, rate: 200, blockCount: 1 }] } : b));
  };
  
  const updateFloor = (buildingId: number, floorId: number, field: keyof Floor, value: string) => {
    const numericValue = value === '' ? 0 : parseFloat(value);
    
    // Validation
    if (field === 'height' && numericValue > 6) {
        showToast("Floor height cannot exceed 6m.");
        return;
    }
    if ((field === 'length' || field === 'breadth') && numericValue > 100) {
        showToast("Dimension cannot exceed 100m.");
        return;
    }

    setBuildings(buildings.map(b => b.id === buildingId ? { 
        ...b, 
        floors: b.floors.map(f => f.id === floorId ? { ...f, [field]: isNaN(numericValue) ? 0 : numericValue } : f)
    } : b));
  };

  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    initAuth(
      (user, token) => {
        setUser(user);
        setNeedsAuth(false);
      },
      () => {
        setUser(null);
        setNeedsAuth(true);
      }
    );
    
    const saved = localStorage.getItem('history');
    if (saved) setHistory(JSON.parse(saved));
    
    setTimeout(() => setIsLoading(false), 2000);
  }, []);

  const calculateFees = () => {
    // 1. Total Volume
    let totalVolume = 0;
    buildings.forEach(b => {
      b.floors.forEach(f => {
        totalVolume += (isNaN(f.length) ? 0 : f.length) * (isNaN(f.breadth) ? 0 : f.breadth) * (isNaN(f.height) ? 0 : f.height) * (isNaN(f.rate) ? 0 : f.rate) * (isNaN(f.blockCount) ? 0 : f.blockCount);
      });
    });

    // 2. Fencing
    let fencingFee = fencingArea > 500 ? 140000 : 20000;

    // 3. Assessment
    let assessment = totalVolume + fencingFee;

    // 4. Processing Fee
    const layoutFee = 150000;
    const regAppFee = 50000;
    const lpo = assessment * 0.10;
    const lasema = assessment * 0.05;
    const sec = assessment;
    let processingFee = assessment + layoutFee + regAppFee + lpo + lasema + sec;

    // 5. Stage Cert
    let stageCertPercent = (stage === 'proposed' && (devType === 'commercial' || devType === 'mixed')) ? 0.35 : 0.15;
    let stageCertFee = assessment * stageCertPercent;

    // 6. IDC
    let idc = 0;
    if (devType === 'residential') {
        if (residentialUnits > 3) idc = (residentialUnits - 3) * 1000000;
    } else if (devType === 'mixed') {
        if (residentialUnits > 3) idc += (residentialUnits - 3) * 1000000;
        idc += lettableArea * 10000;
    } else if (['commercial', 'institutional', 'industrial'].includes(devType)) {
        idc = lettableArea * 10000;
    }

    // 7. Penalty
    let penalty = 0;
    if (stage === 'ongoing') penalty = assessment * 2;
    if (stage === 'asbuilt') penalty = assessment * 4;

    // 8. Waiver
    let waiver = 0;
    if (stage === 'proposed') waiver = processingFee * 0.05;
    let finalProcessingFee = processingFee - waiver;

    // 9. Total
    let totalPayable = finalProcessingFee + stageCertFee + idc + penalty;

    const res = {
        totalPayable,
        breakdown: { totalVolume, fencingFee, assessment, layoutFee, regAppFee, lpo, lasema, sec, processingFee, waiver, finalProcessingFee, stageCertFee, idc, penalty }
    };

    setResult(res);

    const newEntry = { timestamp: Date.now(), ...res };
    const updatedHistory = [newEntry, ...history].slice(0, 5);
    setHistory(updatedHistory);
    localStorage.setItem('history', JSON.stringify(updatedHistory));
  };

  const handleLogin = async () => {
    try {
      await googleSignIn();
    } catch (err) {
      console.error('Login failed:', err);
    }
  };

  const sendEmailSummary = async () => {
    if (!result || !userInfo.email) return;

    if (needsAuth) {
      await handleLogin();
      return;
    }

    const accessToken = await getAccessToken();
    if (!accessToken) return;

    const subject = "Permit Assessment Summary";
    
    let body = `Hello ${userInfo.name || 'Client'},\n\n`;
    body += `Here is your permit assessment summary for development type: ${devType}, stage: ${stage}.\n\n`;
    body += `Total Estimated Payable: ₦${result.totalPayable.toLocaleString()}\n\n`;
    body += `Breakdown:\n`;
    Object.entries(result.breakdown).forEach(([k, v]) => {
        body += `- ${k}: ₦${(v as number).toLocaleString()}\n`;
    });
    
    body += `\nRoadmap Summary:\n`;
    roadmapData[stage as keyof typeof roadmapData].forEach((step, i) => {
        body += `${i + 1}. ${step.title}: ${step.description}\n`;
    });

    body += `\nRequired Documents:\n`;
    getRequiredDocuments(devType, stage, buildings).forEach((docItem) => {
        body += `- ${docItem.name} ${docItem.mandatory ? '(Mandatory)' : ''}\n`;
    });

    const raw = [
      `To: ${userInfo.email}`,
      `Subject: ${subject}`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      body
    ].join('\r\n');

    const encoded = btoa(unescape(encodeURIComponent(raw))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ raw: encoded })
    });
    showToast("Email sent successfully!");
  };

  const exportToPDF = () => {
    if (!result) return;
    const doc = new jsPDF();
    
    // Header
    doc.setTextColor(27, 107, 94); // #1b6b5e
    doc.setFontSize(18);
    doc.text("Permit Assessment Report", 10, 10);
    
    // Client Info
    doc.setTextColor(0, 0, 0); // Black
    doc.setFontSize(12);
    doc.text(`Client: ${userInfo.name || 'Anonymous'}`, 10, 20);
    doc.text(`Email: ${userInfo.email || 'N/A'}`, 10, 25);
    doc.text(`Phone: ${userInfo.phone || 'N/A'}`, 10, 30);
    doc.text(`Development: ${devType} | Stage: ${stage}`, 10, 35);

    // Breakdown Table
    autoTable(doc, {
        startY: 45,
        head: [['Component', 'Amount (₦)']],
        body: Object.entries(result.breakdown).map(([k, v]) => [k, (v as number).toLocaleString()]),
        foot: [['Total Payable', result.totalPayable.toLocaleString()]],
        theme: 'striped',
        headStyles: { fillColor: [27, 107, 94], textColor: [255, 255, 255] }, // #1b6b5e, white
        footStyles: { fillColor: [10, 43, 51], textColor: [255, 255, 255] }, // #0a2b33, white
    });

    // Roadmap/Required Docs Summary
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setTextColor(27, 107, 94); // #1b6b5e
    doc.setFontSize(14);
    doc.text("Roadmap Summary", 10, finalY);
    doc.setTextColor(0, 0, 0); // Black
    doc.setFontSize(10);
    roadmapData[stage as keyof typeof roadmapData].forEach((step, i) => {
        doc.text(`${i + 1}. ${step.title}: ${step.description}`, 10, finalY + 10 + (i * 7), { maxWidth: 180 });
    });

    const docsY = finalY + 60;
    doc.setTextColor(27, 107, 94); // #1b6b5e
    doc.setFontSize(14);
    doc.text("Required Documents", 10, docsY);
    doc.setTextColor(0, 0, 0); // Black
    doc.setFontSize(10);
    getRequiredDocuments(devType, stage, buildings).forEach((docItem, i) => {
        doc.text(`- ${docItem.name} ${docItem.mandatory ? '(Mandatory)' : ''}`, 10, docsY + 10 + (i * 5));
    });

    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text("DISCLAIMER: This document is a rough estimate and not an actual assessment by LASPPPA. Fees are subject to change based on formal verification.", 10, 280, { maxWidth: 180 });

    doc.save("Assessment_Report.pdf");
  };

  if (isLoading) return <LoadingPage />;

  if (!showCalculator) {
    return (
        <div className="max-w-2xl mx-auto p-8 bg-gray-50 min-h-screen flex items-center justify-center">
            <div className="bg-white p-8 rounded-3xl shadow-2xl w-full">
                <h1 className="text-2xl font-bold mb-6 text-[#0a2b33]">Welcome to LASPPPA Permit Estimator</h1>
                <p className="mb-6 text-gray-600">Please provide your details, or skip to proceed anonymously.</p>
                <div className="space-y-4">
                    <input type="text" placeholder="Name" className="w-full border rounded-lg p-3" value={userInfo.name} onChange={e => setUserInfo({...userInfo, name: e.target.value})} />
                    <input type="email" placeholder="Email" className="w-full border rounded-lg p-3" value={userInfo.email} onChange={e => setUserInfo({...userInfo, email: e.target.value})} />
                    <input type="tel" placeholder="Phone" className="w-full border rounded-lg p-3" value={userInfo.phone} onChange={e => setUserInfo({...userInfo, phone: e.target.value})} />
                    <div className="flex gap-4 pt-4">
                        <button className="flex-1 bg-[#1b6b5e] text-white py-3 rounded-full font-bold" onClick={() => setShowCalculator(true)}>Continue</button>
                        <button className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-full font-bold" onClick={() => setShowCalculator(true)}>Skip</button>
                    </div>
                </div>
            </div>
        </div>
    );
  }

  return (
    <div className={darkMode ? 'max-w-7xl mx-auto p-4 md:p-8 bg-gray-900 min-h-screen text-white' : 'max-w-7xl mx-auto p-4 md:p-8 bg-gray-50 min-h-screen'}>
      <div className={darkMode ? "bg-gray-800 shadow-2xl rounded-3xl overflow-hidden" : "bg-white shadow-2xl rounded-3xl overflow-hidden"}>
        <header className="bg-[#1b6b5e] text-white p-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">📐 Permit Assessment Tool</h1>
            <p className="opacity-85 mt-2">Estimate LASPPPA fees and generate your digital roadmap.</p>
          </div>
          <button onClick={toggleDarkMode} className="bg-[#0a2b33] text-white px-4 py-2 rounded-full text-sm font-semibold">
            {darkMode ? 'Light' : 'Dark'} Mode
          </button>
        </header>

        <div className="grid md:grid-cols-2 gap-8 p-8">
          {/* Input Section */}
          <div className="space-y-6 print:hidden">
            <div className="flex bg-gray-100 rounded-full p-1">
              <button className={`flex-1 py-2 rounded-full font-semibold ${activeTab === 'manual' ? 'bg-[#1b6b5e] text-white' : ''}`} onClick={() => setActiveTab('manual')}>Manual Dimensions</button>
              <button className={`flex-1 py-2 rounded-full font-semibold ${activeTab === 'land' ? 'bg-[#1b6b5e] text-white' : ''}`} onClick={() => setActiveTab('land')}>Estimate from Land</button>
            </div>
            
            <div className="space-y-4">
              {/* Select inputs */}
              <div>
                <label className="block text-sm font-medium text-gray-700 flex items-center gap-1">Development Type <Info size={14} className="text-gray-400" title="Classification of building usage (Residential, Commercial, Mixed-use, etc.) based on zoning." /></label>
                <select className="mt-1 block w-full border border-gray-300 rounded-lg p-2" value={devType} onChange={e => setDevType(e.target.value)}>
                  <option value="residential">Residential</option>
                  <option value="commercial">Commercial</option>
                  <option value="institutional">Institutional</option>
                  <option value="industrial">Industrial</option>
                  <option value="mixed">Mixed‑use</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 flex items-center gap-1">Development Stage <Info size={14} className="text-gray-400" title="Status of construction: Proposed (new), Ongoing (construction started), or As-built (completed)." /></label>
                <select className="mt-1 block w-full border border-gray-300 rounded-lg p-2" value={stage} onChange={e => { setStage(e.target.value); setCurrentPhase(0); }}>
                  <option value="proposed">Proposed / New application</option>
                  <option value="ongoing">On‑going (no permit yet)</option>
                  <option value="asbuilt">As‑built / completed without permit</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 flex items-center gap-1">Current Progress Phase (0-5) <Info size={14} className="text-gray-400" title="Phase of the EPPPS workflow (0-5) the project is currently in." /></label>
                <select className="mt-1 block w-full border border-gray-300 rounded-lg p-2" value={currentPhase} onChange={e => setCurrentPhase(parseInt(e.target.value))}>
                    {[0, 1, 2, 3, 4, 5].map(p => <option key={p} value={p}>Phase {p}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 flex items-center gap-1">Fencing Area (sqm) <Info size={14} className="text-gray-400" title="Total surface area of the property boundary fence in square meters." /></label>
                <input type="number" className="mt-1 block w-full border border-gray-300 rounded-lg p-2" value={fencingArea} onChange={e => setFencingArea(parseFloat(e.target.value))} />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 flex items-center gap-1">Residential Units <Info size={14} className="text-gray-400" title="Total number of independent residential dwelling units in the development." /></label>
                <input type="number" className="mt-1 block w-full border border-gray-300 rounded-lg p-2" value={residentialUnits} onChange={e => setResidentialUnits(parseInt(e.target.value))} />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 flex items-center gap-1">Commercial Lettable Area (sqm) <Info size={14} className="text-gray-400" title="Total floor area available for commercial leasing or use, in square meters." /></label>
                <input type="number" className="mt-1 block w-full border border-gray-300 rounded-lg p-2" value={lettableArea} onChange={e => setLettableArea(parseFloat(e.target.value))} />
              </div>

              {/* Checklist */}
              <div className="mt-6 border-t pt-4">
                  <h3 className="font-bold text-gray-800 mb-2">📋 Document Checklist</h3>
                  <ul className="space-y-1 text-sm text-gray-600">
                    {getRequiredDocuments(devType, stage, buildings).map((doc, i) => (
                        <li key={i} className="flex items-center gap-2">
                            <input type="checkbox" className="accent-[#1b6b5e]" />
                            {doc.name} {doc.mandatory && <span className="text-red-500">*</span>}
                        </li>
                    ))}
                  </ul>
              </div>

              {activeTab === 'manual' && (
                <div className="space-y-4">
                  {buildings.map((building, bIdx) => (
                    <div key={building.id} className="border p-4 rounded-lg space-y-2">
                        <h3 className="font-semibold text-gray-800">Building {bIdx + 1}</h3>
                        {building.floors.map((floor) => (
                            <div key={floor.id} className="grid grid-cols-5 gap-2 border p-2 rounded-lg text-sm">
                                <input type="number" placeholder="L(m)" className="border rounded p-1" value={floor.length === 0 ? '' : floor.length} onChange={e => updateFloor(building.id, floor.id, 'length', e.target.value)} />
                                <input type="number" placeholder="B(m)" className="border rounded p-1" value={floor.breadth === 0 ? '' : floor.breadth} onChange={e => updateFloor(building.id, floor.id, 'breadth', e.target.value)} />
                                <input type="number" placeholder="H(m)" className="border rounded p-1" value={floor.height === 0 ? '' : floor.height} onChange={e => updateFloor(building.id, floor.id, 'height', e.target.value)} />
                                <input type="number" placeholder="Rate" className="border rounded p-1" value={floor.rate === 0 ? '' : floor.rate} onChange={e => updateFloor(building.id, floor.id, 'rate', e.target.value)} />
                                <input type="number" placeholder="Blocks" className="border rounded p-1" value={floor.blockCount === 0 ? '' : floor.blockCount} onChange={e => updateFloor(building.id, floor.id, 'blockCount', e.target.value)} />
                            </div>
                        ))}
                        <button className="text-sm text-[#1b6b5e] font-semibold" onClick={() => addFloorToBuilding(building.id)}>+ Add floor to this building</button>
                    </div>
                  ))}
                  <button className="text-sm text-[#1b6b5e] font-semibold" onClick={addBuilding}>+ Add another building</button>
                </div>
              )}

              <button className="w-full bg-[#1b6b5e] text-white py-3 rounded-full font-bold mt-4" onClick={calculateFees}>Calculate Fees</button>
            </div>
          </div>

          {/* Roadmap/Output Section */}
          <div className={darkMode ? "bg-gray-700 p-6 rounded-2xl border border-gray-600" : "bg-gray-50 p-6 rounded-2xl border border-gray-100"}>
            <h2 className="text-xl font-bold mb-4">🚀 Your Assessment & Roadmap</h2>
            
            <div className="flex items-center justify-between mb-8">
                {[0,1,2,3,4,5].map(p => (
                    <div key={p} className={`flex-1 flex flex-col items-center ${p <= currentPhase ? 'text-[#1b6b5e]' : (darkMode ? 'text-gray-400' : 'text-gray-400')}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold mb-1 ${p <= currentPhase ? 'bg-[#1b6b5e] text-white' : (darkMode ? 'bg-gray-600' : 'bg-gray-200')}`}>
                            {p}
                        </div>
                        <span className="text-xs">Ph {p}</span>
                    </div>
                ))}
            </div>

            {result ? (
                <div className="space-y-4">
                    <div className="text-2xl font-bold text-[#1b6b5e]">Total Estimate: ₦{result.totalPayable.toLocaleString()}</div>
                    <div className="flex gap-2 print:hidden">
                        <button onClick={exportToPDF} className="bg-[#0a2b33] text-white px-4 py-2 rounded-full text-sm font-semibold">Export PDF</button>
                        <button onClick={sendEmailSummary} className="bg-[#1b6b5e] text-white px-4 py-2 rounded-full text-sm font-semibold">Email Summary</button>
                    </div>
                    <div className="text-sm space-y-1 border-t pt-2">
                        {Object.entries(result.breakdown).map(([k, v]) => (
                            <div key={k} className="flex justify-between">
                                <span className="capitalize">{k}:</span>
                                <span>₦{(v as number).toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}
            
            <div className="space-y-4 mt-6">
                <h3 className="font-bold text-lg text-[#1b6b5e]">Roadmap for {stage} stage:</h3>
                {roadmapData[stage as keyof typeof roadmapData].map((step, i) => (
                    <div key={i} className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-[#1b6b5e]">
                        <h4 className="font-semibold text-[#1b6b5e]">{step.title}</h4>
                        <p className="text-sm text-gray-600">{step.description}</p>
                    </div>
                ))}
            </div>
            
            {history.length > 0 && (
               <div className="mt-8 border-t pt-4 print:hidden">
                   <h3 className="font-bold text-lg mb-2">🕒 Recent Estimates</h3>
                   <div className="space-y-2">
                       {history.map((entry, i) => (
                           <div key={i} className="text-xs bg-white p-2 rounded border">
                               {new Date(entry.timestamp).toLocaleString()} - <strong>₦{entry.totalPayable.toLocaleString()}</strong>
                           </div>
                       ))}
                   </div>
               </div>
            )}
          </div>
        </div>
      </div>
      {toast.visible && (
        <div className="fixed bottom-4 right-4 bg-red-600 text-white p-4 rounded shadow-lg z-50 animate-bounce">
            {toast.message}
        </div>
      )}
    </div>
  );
};

export default FeeEstimator;
