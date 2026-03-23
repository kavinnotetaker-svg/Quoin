const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/components/dashboard/compliance-queue.tsx');
let content = fs.readFileSync(file, 'utf8');

// 1. Replace the PageHeader + Portfolio Setup Card
const headerRegex = /<PageHeader[\s\S]*?title="Portfolio worklist"[\s\S]*?subtitle="Use the governed worklist[^>]*>[\s\S]*?<div className="w-full border border-zinc-200\/80[\s\S]*?<\/PageHeader>/;
const newHeader = `<div className="flex flex-col lg:flex-row lg:items-end lg:justify-between border-b-2 border-zinc-900 pb-8 mb-12">
        <PageHeader
          title="Portfolio worklist"
          subtitle="Use the governed worklist to see which buildings are blocked, which are ready for review, and which artifacts are ready to finalize or submit."
        />
        <div className="mt-8 lg:mt-0 flex flex-col items-start lg:items-end">
          <div className="text-[10px] font-mono tracking-[0.2em] text-zinc-500 uppercase mb-3">Portfolio Setup</div>
          <button
            onClick={() => setIsCreateDialogOpen(true)}
            className="group flex items-center gap-2 text-[13px] font-medium text-zinc-900 hover:text-zinc-600 transition-colors"
          >
            <Plus size={16} className="text-zinc-400 group-hover:text-zinc-900 transition-colors" />
            Add building workflow
          </button>
        </div>
      </div>`;

content = content.replace(headerRegex, newHeader);

// 2. Replace the Dialog form to make it boxless
const dialogRegex = /<DialogHeader className="border-b border-zinc-200 px-6 py-5">[\s\S]*?<\/DialogHeader>[\s\S]*?<div className="max-h-\[calc\(100vh-8rem\)\] overflow-y-auto px-6 py-6"[\s\S]*?<div className="rounded-2xl border border-zinc-200 bg-zinc-50\/80 p-5 shadow-sm">[\s\S]*?<\/div>\s*<div className="min-w-0">/;
const newDialog = `<DialogHeader className="border-b border-zinc-200 px-6 py-5">
            <DialogTitle>Add building</DialogTitle>
            <DialogDescription>
              Create a building record so it can enter the governed compliance workflow.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[calc(100vh-8rem)] overflow-y-auto px-6 py-6">
            <div className="space-y-5">
              <div className="min-w-0">`;
content = content.replace(dialogRegex, newDialog);


// 3. Replace the metrics strip and sub-metrics
const metricsRegex = /<div className="quoin-metric-strip lg:grid-cols-4">[\s\S]*?<div className="grid gap-x-8 gap-y-3 border-t border-zinc-200 pt-5 text-sm text-zinc-600 md:grid-cols-2 xl:grid-cols-4">[\s\S]*?<\/div>\s*<\/div>/;
const newMetrics = `<div className="grid lg:grid-cols-4 gap-x-12 gap-y-10">
          {[
            {
              label: "Needs attention now",
              value: data.aggregate.needsAttentionNow.toString().padStart(2, "0"),
              copy: "Buildings with immediate governed blockers, workflow stalls, or urgent operational follow-up.",
            },
            {
              label: "Ready for review",
              value: data.aggregate.readyForReview.toString().padStart(2, "0"),
              copy: "Governed building records prepared for consultant review.",
            },
            {
              label: "Ready to submit",
              value: data.aggregate.readyToSubmit.toString().padStart(2, "0"),
              copy: "Artifacts and workflow state aligned for submission handling.",
            },
            {
              label: "Penalty exposure",
              value: data.aggregate.withPenaltyExposure.toString().padStart(2, "0"),
              copy: "Buildings with an active governed penalty estimate on record.",
            },
          ].map((item) => (
            <div key={item.label}>
              <div className="text-[10px] font-mono tracking-[0.2em] text-zinc-500 uppercase mb-4">{item.label}</div>
              <div className="font-display text-5xl tracking-tight text-zinc-900 mb-4">{item.value}</div>
              <div className="text-[13px] leading-relaxed text-zinc-600">{item.copy}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-x-12 gap-y-6 border-t border-zinc-200 pt-8 text-[13px] text-zinc-900 md:grid-cols-2 xl:grid-cols-4 font-mono">
          {[
            ["Blocked", data.aggregate.blocked],
            ["Submission queue", data.aggregate.submissionQueue],
            ["Review queue", data.aggregate.reviewQueue],
            ["Needs correction", data.aggregate.needsCorrection],
            ["Operational risk", data.aggregate.withOperationalRisk],
            ["Retrofit opportunities", data.aggregate.withActionableRetrofits],
            ["Sync attention", data.aggregate.withSyncAttention],
            ["Draft artifacts", data.aggregate.withDraftArtifacts],
          ].map(([label, value]) => (
            <div key={label as string} className="flex flex-col gap-1">
              <span className="text-[10px] tracking-[0.1em] text-zinc-500 uppercase">{label}</span>
              <span className="text-lg">{String(value)}</span>
            </div>
          ))}
        </div>`;
content = content.replace(metricsRegex, newMetrics);

fs.writeFileSync(file, content);
console.log('Successfully rewrote compliance queue layout');
