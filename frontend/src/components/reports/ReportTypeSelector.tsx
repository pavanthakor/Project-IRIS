import { ReportType } from "@/pages/ReportPage";
import { CheckCircle } from "lucide-react";
import clsx from "clsx";

const reportTypes: { title: ReportType, description: string }[] = [
  {
    title: "Incident report",
    description: "Full IoC profile for one incident",
  },
  {
    title: "Threat summary",
    description: "Multi-IoC overview for management",
  },
  {
    title: "IoC watchlist",
    description: "Exportable blocklist with verdicts",
  },
  {
    title: "MITRE mapping",
    description: "ATT&CK technique coverage report",
  },
];

interface ReportTypeSelectorProps {
    selectedType: ReportType;
    onSelectType: (type: ReportType) => void;
}

const ReportTypeSelector = ({ selectedType, onSelectType }: ReportTypeSelectorProps) => {
  return (
    <section>
      <h2 className="text-xl font-bold mb-4">1. Report Type</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {reportTypes.map((type) => (
          <div
            key={type.title}
            onClick={() => onSelectType(type.title)}
            className={clsx(
              "p-4 rounded-lg border-2 cursor-pointer transition-all",
              {
                "border-iris-500 bg-iris-500/10": selectedType === type.title,
                "border-slate-700 hover:border-slate-600": selectedType !== type.title,
              }
            )}
          >
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-bold">{type.title}</h3>
                <p className="text-sm text-slate-400">{type.description}</p>
              </div>
              {selectedType === type.title && (
                <CheckCircle className="text-iris-500" size={20} />
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default ReportTypeSelector;
