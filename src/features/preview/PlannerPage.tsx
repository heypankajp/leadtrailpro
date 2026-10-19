"use client";

import { CalendarDays, MapPin, MoreHorizontal, ShieldCheck, Sparkles } from "lucide-react";
import { formatDate, localToday } from "@/lib/format";

/** Preview only: route optimization needs a maps/routing service (BRD section 17). */
export default function PlannerPage() {
  const stops = [
    { time: "9:00 AM", company: "Northstar Logistics", address: "2300 Finch Ave W, Toronto", color: "violet" },
    { time: "10:45 AM", company: "Axiom Industrial", address: "8000 Keele St, Vaughan", color: "blue" },
    { time: "1:30 PM", company: "Lunch break", address: "30 minutes · near your route", color: "orange", lunch: true },
    { time: "2:15 PM", company: "Cedarline Foods", address: "100 Carrier Dr, Etobicoke", color: "green" },
    { time: "3:45 PM", company: "Fable & Stone", address: "180 Queen St W, Toronto", color: "pink" },
  ];
  return (
    <>
      <div className="page-heading"><div><div className="eyebrow">PLAN YOUR DAY <span className="eyebrow-dot">·</span> PREVIEW</div><h1>Road visit planner</h1><p>Make the most of every mile with a thoughtful route. Visits you log on leads already count toward your targets.</p></div></div>
      <div className="planner-toolbar panel"><div className="planner-date"><CalendarDays size={17} /><strong>{formatDate(localToday())}</strong></div><span className="planner-route-note"><MapPin size={14} /> 4 stops <span>·</span> 26 km total</span><button className="button button-outline" disabled><Sparkles size={15} /> Optimize route</button></div>
      <div className="planner-layout">
        <div className="panel route-panel">
          <div className="panel-heading"><div><h2>Sample route</h2><p>Estimated drive time: 1 hr 12 min</p></div></div>
          <div className="route-stops">
            {stops.map((stop) => (
              <div className={`route-stop ${stop.lunch ? "lunch-stop" : ""}`} key={stop.company}>
                <div className="route-time">{stop.time}</div>
                <div className={`route-point point-${stop.color}`}>{stop.lunch ? <span>☕</span> : <MapPin size={14} />}</div>
                <div className="route-stop-info"><strong>{stop.company}</strong><small>{stop.address}</small></div>
                <span className="route-status">{stop.lunch ? "30 min" : "Visit planned"}</span>
                <button className="row-more" aria-label={`Options for ${stop.company}`} disabled><MoreHorizontal size={17} /></button>
              </div>
            ))}
          </div>
        </div>
        <div className="map-placeholder"><div className="map-grid" /><span className="map-water" /><span className="map-label label-one">NORTH YORK</span><span className="map-label label-two">ETOBICOKE</span><span className="map-label label-three">TORONTO</span><div className="map-route-line" /><span className="map-pin pin-one">1</span><span className="map-pin pin-two">2</span><span className="map-pin pin-three">3</span><span className="map-pin pin-four">4</span><span className="map-attribution">Map preview</span></div>
      </div>
      <div className="integration-note"><ShieldCheck size={16} /><span><strong>Preview.</strong> Date selection, company entry, route optimization with a 1:30 PM lunch break, and company briefs per stop will arrive with a routing service connection.</span></div>
    </>
  );
}
