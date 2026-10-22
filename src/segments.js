// Conservative inline-XBRL segment reader. Only single-axis revenue partitions
// that reconcile to reported consolidated revenue are accepted. No guessed weights.
import {TAGS} from './accounting.js';
const attrs=s=>Object.fromEntries([...s.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map(m=>[m[1].toLowerCase(),m[2]]));
const strip=s=>s.replace(/<[^>]*>/g,'').replace(/&nbsp;|&#160;|&#xA0;/gi,' ').replace(/&amp;/g,'&').trim();
const label=s=>s.split(':').at(-1).replace(/Member$/,'').replace(/([a-z\d])([A-Z])/g,'$1 $2');
export function reportedSegments(html,annualHistory,url) {
  const contexts=new Map(),units=new Map(),groups=new Map();
  for(const m of html.matchAll(/<(?:xbrli:)?unit\b([^>]*)>([\s\S]*?)<\/(?:xbrli:)?unit>/gi))units.set(attrs(m[1]).id,/\b(?:iso4217:)?USD\b/i.test(strip(m[2]))&&!/divide/i.test(m[2]));
  for(const m of html.matchAll(/<(?:xbrli:)?context\b([^>]*)>([\s\S]*?)<\/(?:xbrli:)?context>/gi)) {
    const body=m[2],rawDimensions=[...body.matchAll(/<(?:xbrldi:)?explicitMember\b([^>]*)>([\s\S]*?)<\/(?:xbrldi:)?explicitMember>/gi)];
    // An operating-segment consolidation marker qualifies the whole partition;
    // it is not a second geographic/product slice. No other dimensions are dropped.
    const dimensions=rawDimensions.filter(d=>!(attrs(d[1]).dimension==='srt:ConsolidationItemsAxis'&&strip(d[2])==='us-gaap:OperatingSegmentsMember'));
    if(dimensions.length!==1||/typedMember/i.test(body))continue;
    const axis=attrs(dimensions[0][1]).dimension,member=strip(dimensions[0][2]);
    if(!/Product|Service|BusinessSegment|OperatingSegment|Segments|BusinessUnit/i.test(axis)||/Geograph|Country|Region/i.test(axis))continue;
    const start=body.match(/<(?:xbrli:)?startDate>([^<]+)</i)?.[1],end=body.match(/<(?:xbrli:)?endDate>([^<]+)</i)?.[1];
    if(!start||!end)continue;
    const days=(Date.parse(end)-Date.parse(start))/864e5;if(days<330||days>380)continue;
    contexts.set(attrs(m[1]).id,{axis,member,start,end});
  }
  for(const m of html.matchAll(/<ix:nonFraction\b([^>]*)>([\s\S]*?)<\/ix:nonFraction>/gi)) {
    const a=attrs(m[1]),context=contexts.get(a.contextref),tag=a.name?.split(':').at(-1);
    if(!context||!TAGS.revenue.includes(tag)||!units.get(a.unitref)||a['xsi:nil']==='true')continue;
    const text=strip(m[2]);if(!/^\(?-?[\d,]+(?:\.\d+)?\)?$/.test(text))continue;
    const value=Number(text.replace(/[,()]/g,''))*10**Number(a.scale||0)*(a.sign==='-'||/^\(/.test(text)?-1:1)/1e6;
    if(!(value>=0)||!Number.isFinite(value))continue;
    const key=[context.axis,context.start,context.end,tag].join('|');
    if(!groups.has(key))groups.set(key,{...context,tag,members:new Map()});
    const group=groups.get(key),prior=group.members.get(context.member);
    if(prior!==undefined&&Math.abs(prior-value)>Math.max(1,value*.001)){group.conflict=true;continue;}
    group.members.set(context.member,value);
  }
  const partitions=[];
  for(const group of groups.values()) {
    if(group.conflict||group.members.size<2||group.members.size>15)continue;
    const actual=annualHistory.find(r=>r.end===group.end)?.revenue;
    // ProductMember is a parent, not an additional product. Remove it only if
    // all non-service leaf members independently sum exactly to that parent.
    const parent=group.members.get('us-gaap:ProductMember');
    if(parent!==undefined&&group.members.size>2){const leaves=[...group.members].filter(([m])=>m!=='us-gaap:ProductMember'&&!/Service(?:s)?Member$/.test(m));const sum=leaves.reduce((t,[,v])=>t+v,0);if(leaves.length>1&&Math.abs(sum-parent)<=Math.max(1,parent*.001))group.members.delete('us-gaap:ProductMember');}
    const total=[...group.members.values()].reduce((s,n)=>s+n,0);
    if(!(actual>0)||Math.abs(total-actual)>Math.max(1,actual*.005))continue;
    partitions.push({axis:group.axis,start:group.start,end:group.end,tag:group.tag,total,consolidated:actual,difference:total-actual,
      members:[...group.members].map(([member,revenue])=>({member,name:label(member),revenue,weight:revenue/total})),source:url});
  }
  // Prefer the same partition across periods; do not combine different axes.
  const latest=annualHistory.at(-1)?.end,candidates=partitions.filter(p=>p.end===latest).sort((a,b)=>b.members.length-a.members.length||a.axis.localeCompare(b.axis));
  if(!candidates.length)return {status:'unavailable',reason:'No supported single-axis revenue partition reconciled to consolidated annual revenue.',partitions:[]};
  const selected=candidates[0],series=partitions.filter(p=>p.axis===selected.axis&&p.tag===selected.tag).sort((a,b)=>a.end.localeCompare(b.end));
  return {status:'reconciled',axis:selected.axis,latest:selected,partitions:series,
    limitations:['Segment labels are derived from XBRL member names. Reclassifications and acquisitions can break comparability.','This parser accepts standard revenue concepts and single business dimensions only (plus a recognized operating-segment consolidation marker). Missing or custom partitions remain unavailable.','Segment data is historical evidence; a reconciliation does not validate future growth.']};
}
