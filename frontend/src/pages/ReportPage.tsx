import { useState } from "react";
import ExportFormatSelector from "@/components/reports/ExportFormatSelector";
import IoCSelectorList from "@/components/reports/IoCSelectorList";
import ReportDetails from "@/components/reports/ReportDetails";
import ReportPreview from "@/components/reports/ReportPreview";
import ReportSections from "@/components/reports/ReportSections";
import ReportTypeSelector from "@/components/reports/ReportTypeSelector";
import { QueryHistoryItem, ThreatProfile } from "@/types";
import { getQueryById } from "@/services/api";

export type ReportFormat = "PDF" | "JSON" | "CSV";
export type ReportType = "Incident report" | "Threat summary" | "IoC watchlist" | "MITRE mapping";
export type TLP = "TLP:WHITE" | "TLP:GREEN" | "TLP:AMBER" | "TLP:RED";

export interface ReportSection {
  id: string;
  label: string;
  enabled: boolean;
}

const ReportPage = () => {
  const [reportType, setReportType] = useState<ReportType>("Incident report");
  const [selectedIocs, setSelectedIocs] = useState<QueryHistoryItem[]>([]);
  const [sections, setSections] = useState<ReportSection[]>([
    { id: "summary", label: "Executive summary", enabled: true },
    { id: "details", label: "IoC details", enabled: true },
    { id: "feed", label: "Feed results", enabled: true },
    { id: "mitre", label: "MITRE ATT&CK mapping", enabled: true },
    { id: "risk", label: "Risk score breakdown", enabled: false },
    { id: "recommendations", label: "Recommendations", enabled: false },
    { id: "raw", label: "Raw JSON appendix", enabled: false },
  ]);
  const [title, setTitle] = useState(`Threat Intelligence Report — ${new Date().toLocaleString('default', { month: 'short', year: 'numeric' })}`);
  const [analyst, setAnalyst] = useState("SOC Team");
  const [classification, setClassification] = useState<TLP>("TLP:AMBER");
  const [format, setFormat] = useState<ReportFormat>("PDF");
  const [isGenerating, setIsGenerating] = useState(false);

  const generateJson = (profiles: ThreatProfile[]) => {
    const data = {
      title,
      analyst,
      classification,
      generatedAt: new Date().toISOString(),
      iocs: profiles,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/ /g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const generateCsv = (profiles: ThreatProfile[]) => {
    const headers = ["ioc", "type", "riskScore", "riskLevel", "verdict", "maliciousFeeds", "totalFeeds"];
    const rows = profiles.map(p => [
      p.ioc,
      p.type,
      p.riskScore,
      p.riskLevel,
      p.verdict,
      p.feeds.filter(f => f.status === 'success' && f.detections && f.detections > 0).length,
      p.feeds.filter(f => f.status === 'success').length
    ].join(','));
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/ /g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const generatePdf = (profiles: ThreatProfile[]) => {
    // This will be a simple HTML page for now
    const newWindow = window.open();
    if (newWindow) {
      newWindow.document.write("<h1>PDF Generation (Preview)</h1>");
      newWindow.document.write(`<p>This will be the styled report for ${profiles.length} IoCs.</p>`);
      newWindow.document.write("<pre>" + JSON.stringify(profiles, null, 2) + "</pre>");
      // In a real scenario, we would render a full React component here with print styles
    }
  };

  const handleGenerateReport = async () => {
    if (selectedIocs.length === 0) {
      alert("Please select at least one IoC.");
      return;
    }
    setIsGenerating(true);
    try {
      const profiles = await Promise.all(
        selectedIocs.map(ioc => getQueryById(ioc.id))
      );

      switch (format) {
        case "JSON":
          generateJson(profiles);
          break;
        case "CSV":
          generateCsv(profiles);
          break;
        case "PDF":
          generatePdf(profiles);
          break;
      }
    } catch (error) {
      console.error("Failed to generate report", error);
      alert("An error occurred while generating the report.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Left Column: Configuration */}
        <div className="lg:col-span-3 space-y-8">
          <ReportTypeSelector selectedType={reportType} onSelectType={setReportType} />
          <IoCSelectorList selectedIocs={selectedIocs} onSelectionChange={setSelectedIocs} />
          <ReportSections sections={sections} onSectionsChange={setSections} />
          <ReportDetails
            title={title}
            analyst={analyst}
            classification={classification}
            onTitleChange={setTitle}
            onAnalystChange={setAnalyst}
            onClassificationChange={setClassification}
          />
          <ExportFormatSelector selectedFormat={format} onSelectFormat={setFormat} />
          <button
            onClick={handleGenerateReport}
            disabled={isGenerating || selectedIocs.length === 0}
            className="w-full bg-iris-500 text-white font-bold py-3 px-4 rounded-lg hover:bg-iris-600 transition-colors flex items-center justify-center text-lg disabled:bg-slate-600 disabled:cursor-not-allowed"
          >
            {isGenerating ? "Generating..." : "Generate report ↗"}
          </button>
        </div>

        {/* Right Column: Live Preview */}
        <div className="lg:col-span-2">
          <ReportPreview
            title={title}
            classification={classification}
            iocs={selectedIocs}
            sections={sections}
          />
        </div>
      </div>
    </div>
  );
};

export default ReportPage;
