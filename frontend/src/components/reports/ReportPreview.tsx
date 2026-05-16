import { ReportSection, TLP } from "@/pages/ReportPage";
import { QueryHistoryItem } from "@/types";
import { Badge } from "../ui/badge";
import clsx from "clsx";
import { ComingSoonTooltip } from "../ui/ComingSoonTooltip";

interface ReportPreviewProps {
    title: string;
    classification: TLP;
    iocs: QueryHistoryItem[];
    sections: ReportSection[];
}

const getTlpBadgeClass = (tlp: TLP) => {
    switch (tlp) {
        case 'TLP:RED': return 'bg-red-600 text-white';
        case 'TLP:AMBER': return 'bg-amber-500 text-black';
        case 'TLP:GREEN': return 'bg-green-600 text-white';
        case 'TLP:WHITE': return 'bg-slate-300 text-black';
        default: return 'bg-slate-500 text-white';
    }
}

const ReportPreview = ({ title, classification, iocs, sections }: ReportPreviewProps) => {
    const isSectionEnabled = (id: string) => sections.find(s => s.id === id)?.enabled;

    if (iocs.length === 0) {
        return (
            <div className="sticky top-24">
                <div className="text-center mb-2">
                    <span className="bg-slate-700 text-slate-300 text-xs font-bold me-2 px-2.5 py-1 rounded-full uppercase">
                        Live Preview
                    </span>
                </div>
                <div className="bg-slate-100 text-slate-900 rounded-lg p-6 shadow-lg min-h-[600px] flex items-center justify-center">
                    <p className="text-center text-slate-500">Select at least one IoC to preview report</p>
                </div>
            </div>
        );
    }

    return (
      <div className="sticky top-24">
        <div className="text-center mb-2">
            <span className="bg-slate-700 text-slate-300 text-xs font-bold me-2 px-2.5 py-1 rounded-full uppercase">
                Live Preview
            </span>
        </div>
        <div className="bg-slate-100 text-slate-900 rounded-lg p-6 shadow-lg min-h-[600px] text-sm relative">
            <header className="border-b border-slate-300 pb-4 mb-4">
                <div className="flex justify-between items-start">
                    <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
                    <Badge className={clsx("text-xs", getTlpBadgeClass(classification))}>{classification}</Badge>
                </div>
                <div className="text-slate-500 text-xs mt-1">
                    <span>{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                    <span className="mx-2">|</span>
                    <span>{iocs.length} IoCs</span>
                    <span className="mx-2">|</span>
                    <span>~{iocs.length * 5} Feeds Queried</span>
                </div>
            </header>

            {isSectionEnabled('summary') && (
                <section className="mb-6">
                    <h2 className="font-bold text-lg mb-2 border-b border-slate-300 pb-1">Executive Summary</h2>
                    <p className="text-slate-600">
                        This report details the analysis of {iocs.length} indicators of compromise (IoCs). The highest risk observed was <span className="font-bold">{iocs[0]?.riskLevel || 'N/A'}</span> with a score of <span className="font-bold">{iocs[0]?.riskScore || 'N/A'}</span>. Key findings suggest potential malicious activity related to...
                    </p>
                </section>
            )}

            {isSectionEnabled('details') && (
                <section className="mb-6">
                    <h2 className="font-bold text-lg mb-2 border-b border-slate-300 pb-1">IoC Details</h2>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-slate-300">
                                    <th className="p-2">Indicator</th>
                                    <th className="p-2">Type</th>
                                    <th className="p-2">Risk</th>
                                </tr>
                            </thead>
                            <tbody>
                                {iocs.slice(0, 5).map(ioc => (
                                    <tr key={ioc.id} className="border-b border-slate-200">
                                        <td className="p-2 font-mono text-xs">{ioc.iocValue}</td>
                                        <td className="p-2">{ioc.iocType.toUpperCase()}</td>
                                        <td className="p-2 font-bold">{ioc.riskLevel || 'N/A'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {iocs.length > 5 && <p className="text-center text-xs text-slate-500 mt-2">...and {iocs.length - 5} more.</p>}
                    </div>
                </section>
            )}

            {isSectionEnabled('mitre') && (
                <section>
                    <h2 className="font-bold text-lg mb-2 border-b border-slate-300 pb-1">MITRE ATT&CK Mapping</h2>
                    <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">T1566: Phishing</Badge>
                        <Badge variant="secondary">T1059: Command and Control</Badge>
                        <Badge variant="secondary">T1204: User Execution</Badge>
                    </div>
                </section>
            )}

            <footer className="text-center text-xs text-slate-400 absolute bottom-4 left-0 right-0">
                Generated by IRIS · Confidential
            </footer>
        </div>
        <div className="mt-4 space-y-2">
            <button className="w-full bg-slate-700 text-white font-bold py-2 px-4 rounded-lg hover:bg-slate-600 transition-colors flex items-center justify-center">
                Preview full PDF ↗
            </button>
            <ComingSoonTooltip>
                <button className="w-full bg-slate-700 text-white font-bold py-2 px-4 rounded-lg hover:bg-slate-600 transition-colors flex items-center justify-center cursor-not-allowed opacity-60">
                    Schedule auto-report ↗
                </button>
            </ComingSoonTooltip>
        </div>
      </div>
    );
  };
  
  export default ReportPreview;
  