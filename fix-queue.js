const fs = require('fs');
let content = fs.readFileSync('src/components/dashboard/compliance-queue.tsx', 'utf8');

// 1. Remove the pills
const pillsRegex = /<div className="flex flex-wrap gap-2">\s*{\[\s*{\s*label:\s*"Needs attention now"[\s\S]*?<\/div>\s*<div className="flex flex-wrap items-center/g;
content = content.replace(pillsRegex, '<div className="flex flex-wrap items-center');

// 2. Replace the table head
const theadRegex = /<thead className="bg-zinc-50\/70">[\s\S]*?<\/thead>/g;
content = content.replace(theadRegex, `<thead className="bg-zinc-50/70">
                <tr className="border-y border-zinc-200 text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">
                  {canManageOperatorActions ? (
                    <th className="px-5 py-3 font-semibold w-[1%]">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={(event) => toggleVisibleSelection(event.target.checked)}
                        aria-label="Select all visible buildings"
                      />
                    </th>
                  ) : null}
                  <th className="px-5 py-3 font-semibold">Building & Triage</th>
                  <th className="px-5 py-3 font-semibold">Primary Status</th>
                  <th className="px-5 py-3 font-semibold">Current Blocker</th>
                  <th className="px-5 py-3 font-semibold">Next Action</th>
                </tr>
              </thead>`);

// 3. Replace the tr mapping inside tbody
const tbodyInnerRegex = /{data\.items\.map\(\(item\) => {[\s\S]*?}\)[;\]]?}/g;
content = content.replace(tbodyInnerRegex, `{data.items.map((item) => {
                  const compliance = getPrimaryComplianceStatusDisplay(item.complianceSummary.primaryStatus);
                  const benchmarkArtifact = getPacketStatusDisplay(item.artifacts.benchmark.status);

                  return (
                    <tr key={item.buildingId} className="align-top transition-colors hover:bg-zinc-50/60">
                      {canManageOperatorActions ? (
                        <td className="px-5 py-4 w-[1%] whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={selectedBuildingIds.includes(item.buildingId)}
                            onChange={(event) =>
                              toggleBuildingSelection(item.buildingId, event.target.checked)
                            }
                            aria-label={\`Select \${item.buildingName}\`}
                          />
                        </td>
                      ) : null}
                      <td className="px-5 py-4 min-w-[280px]">
                        <div className="flex items-center gap-3">
                           <Link href={\`/buildings/\${item.buildingId}\`} className="font-display text-base font-medium tracking-tight text-zinc-900 hover:text-zinc-600 transition-colors">
                             {item.buildingName}
                           </Link>
                           {item.triage.urgency === "NOW" && (
                             <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm bg-red-50 text-red-700 text-[10px] font-mono uppercase tracking-widest ring-1 ring-inset ring-red-600/20">
                               Action Required
                             </span>
                           )}
                        </div>
                        <div className="mt-1 text-[13px] text-zinc-500">{item.address}</div>
                        <div className="mt-2 text-[13px] text-zinc-500 max-w-[280px] leading-relaxed">
                          {item.triage.cue}
                        </div>
                      </td>
                      <td className="px-5 py-4 min-w-[240px]">
                        <div className="font-medium text-zinc-900">{compliance.label}</div>
                        <div className="mt-1 text-[13px] text-zinc-500">
                           {item.flags.readyToSubmit ? "Ready to submit" : item.flags.readyForReview ? "Ready for consultant review" : "Not mathematically ready"}
                        </div>
                        <div className="mt-2 text-[10px] font-mono uppercase tracking-widest text-zinc-400">
                           Artifacts: {benchmarkArtifact.label}
                        </div>
                      </td>
                      <td className="px-5 py-4 min-w-[260px]">
                         {item.blockingIssueCount > 0 ? (
                           <div className="text-[14px] font-medium text-red-700">{item.blockingIssueCount} Blocking Issues</div>
                         ) : (
                           <div className="text-[14px] font-medium text-zinc-900">No Blockers</div>
                         )}
                         <div className="mt-1 text-[13px] text-zinc-500 max-w-[280px] leading-relaxed">
                           {item.complianceSummary.reasonSummary}
                         </div>
                         {item.penaltySummary?.currentEstimatedPenalty != null && item.penaltySummary.currentEstimatedPenalty > 0 && (
                           <div className="mt-2 text-[10px] font-mono uppercase tracking-widest text-amber-600">
                             Exposure: {formatMoney(item.penaltySummary.currentEstimatedPenalty)}
                           </div>
                         )}
                      </td>
                      <td className="px-5 py-4 min-w-[260px]">
                        <div className="font-medium text-zinc-900">{item.nextAction.title}</div>
                        <div className="mt-1 text-[13px] text-zinc-500 max-w-[280px] leading-relaxed">{item.nextAction.reason}</div>
                        <div className="mt-2 text-[10px] font-mono uppercase tracking-widest text-zinc-400">
                          Updated: {formatDate(item.timestamps.lastComplianceEvaluatedAt)}
                        </div>
                      </td>
                    </tr>
                  );
                })}`);

fs.writeFileSync('src/components/dashboard/compliance-queue.tsx', content);
console.log('Fixed compliance-queue.tsx!');
