"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, BriefcaseBusiness, Building2, MapPin, ShieldCheck, Sparkles } from "lucide-react";
import { useApp } from "@/features/shell/AppContext";

/** Preview only: the BRD's lead generation module needs connected job, review, and company-data sources. */
export default function LeadGenerationPage() {
  const { openNewLead, can, notify } = useApp();
  const [company, setCompany] = useState("");
  const [generated, setGenerated] = useState<string | null>(null);

  const generate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setGenerated(company.trim() || "Acme Industries");
    notify("Company brief generated from sample preview data.", "info");
  };

  return (
    <>
      <div className="page-heading"><div><div className="eyebrow">DISCOVER YOUR NEXT CLIENT <span className="eyebrow-dot">·</span> PREVIEW</div><h1>Lead generation</h1><p>Explore a company and find a thoughtful way to start a conversation.</p></div></div>
      <div className="panel generation-panel">
        <div className="generation-intro"><div className="generation-icon"><Sparkles size={20} /></div><div><h2>Research a company</h2><p>Company overview, open positions, hiring challenges, review summary, and a suggested introduction.</p></div></div>
        <form className="generation-form" onSubmit={generate}>
          <label>Company name<input required placeholder="e.g. Acme Industries" value={company} onChange={(event) => setCompany(event.target.value)} /></label>
          <label>Company website<input type="url" placeholder="https://company.com" /></label>
          <label>Search radius<span className="input-with-suffix"><input type="number" defaultValue="25" min="1" /><span>km</span></span></label>
          <button className="button button-primary" type="submit"><Sparkles size={16} /> Generate company brief</button>
        </form>
        {generated && (
          <div className="generated-brief">
            <div className="brief-heading"><div><span className="eyebrow">COMPANY BRIEF · SAMPLE</span><h2>{generated}</h2></div><span className="match-score"><span>86%</span><small>fit score</small></span></div>
            <p>Sample content. Once job-board, careers-page, review, and company-data sources are connected, this brief will show the real overview, open positions, hiring challenges, interview and review summaries, a suggested engagement approach, and similar companies within the radius.</p>
            <div className="brief-pills"><span><BriefcaseBusiness size={13} /> Open roles</span><span><MapPin size={13} /> Within 25 km</span><span><Building2 size={13} /> Industry</span></div>
            <div className="brief-actions">
              {can("create_leads") && <button className="button button-primary" onClick={openNewLead}>Create a lead <ArrowRight size={14} /></button>}
            </div>
          </div>
        )}
      </div>
      <div className="integration-note"><ShieldCheck size={16} /><span><strong>Preview.</strong> Company research, reviews, and job sources require connected, approved integrations (BRD section 16). Nothing on this page is saved yet.</span></div>
    </>
  );
}
