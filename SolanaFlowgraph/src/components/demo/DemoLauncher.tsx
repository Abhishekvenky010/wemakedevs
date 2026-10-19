import Card from "@/components/ui/Card";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Icon from "@/components/ui/Icon";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Spinner } from "@/components/ui/LoadingState";

interface DemoLauncherProps {
  seeding: boolean;
  seeded: boolean;
  error: string | null;
  onSeed: () => void;
}

const demoWallets = ["demo_wallet_1", "demo_wallet_2", "demo_wallet_3"];

export default function DemoLauncher({
  seeding,
  seeded,
  error,
  onSeed,
}: DemoLauncherProps) {
  return (
    <Card>
      <SectionHeading
        icon="sparkles"
        tone="violet"
        title="Seed the demo cycle"
        description="Create a deterministic three-wallet USDC loop, then run the same graph investigation used for live wallets."
        action={
          <Badge tone={seeded ? "emerald" : "violet"} dot>
            {seeded ? "Seeded" : "Ready to seed"}
          </Badge>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.7fr)]">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={seeding || seeded}
              onClick={onSeed}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-6 text-sm font-semibold text-white shadow-lg shadow-violet-500/20 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-violet-500/25 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {seeding ? (
                <>
                  <Spinner />
                  Seeding demo data…
                </>
              ) : seeded ? (
                <>
                  <Icon name="check" size={16} />
                  Demo data seeded
                </>
              ) : (
                <>
                  <Icon name="database" size={16} />
                  Seed demo data
                </>
              )}
            </button>
            <button
              type="button"
              disabled={!seeded || seeding}
              onClick={onSeed}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Icon name="refresh" size={16} />
              Regenerate report
            </button>
          </div>

          {error && (
            <Alert tone="rose" title="Demo setup failed">
              {error}
            </Alert>
          )}
          {seeded && (
            <Alert tone="emerald" title="Demo cycle created">
              demo_wallet_1 → demo_wallet_2 → demo_wallet_3 → demo_wallet_1
            </Alert>
          )}
          <p className="flex items-start gap-2 text-xs leading-5 text-slate-500">
            <Icon name="lock" size={14} className="mt-0.5 shrink-0" />
            Demo data is tagged as synthetic and is never mixed with real wallet
            evidence.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Seeded cycle
          </p>
          <div className="mt-4 flex flex-col items-center gap-2">
            {demoWallets.map((wallet, index) => (
              <div key={wallet} className="flex w-full flex-col items-center gap-2">
                <span className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-[11px] font-medium text-slate-700 shadow-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                  {wallet}
                </span>
                {index < demoWallets.length - 1 && (
                  <Icon
                    name="arrow-right"
                    size={15}
                    className="rotate-90 text-slate-400"
                  />
                )}
              </div>
            ))}
            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
              <Icon name="refresh" size={12} className="text-violet-500" />
              loops back to demo_wallet_1
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
