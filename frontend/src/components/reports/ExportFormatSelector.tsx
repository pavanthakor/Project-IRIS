import { ReportFormat } from "@/pages/ReportPage";
import { FileText, Braces, Table } from "lucide-react";
import clsx from "clsx";

const formats: { name: ReportFormat, icon: React.ElementType }[] = [
  { name: "PDF", icon: FileText },
  { name: "JSON", icon: Braces },
  { name: "CSV", icon: Table },
];

interface ExportFormatSelectorProps {
    selectedFormat: ReportFormat;
    onSelectFormat: (format: ReportFormat) => void;
}

const ExportFormatSelector = ({ selectedFormat, onSelectFormat }: ExportFormatSelectorProps) => {
  return (
    <section>
      <h2 className="text-xl font-bold mb-4">5. Export Format</h2>
      <div className="grid grid-cols-3 gap-4">
        {formats.map((format) => (
          <div
            key={format.name}
            onClick={() => onSelectFormat(format.name)}
            className={clsx(
              "p-4 rounded-lg border-2 cursor-pointer transition-all flex flex-col items-center justify-center",
              {
                "border-iris-500 bg-iris-500/10": selectedFormat === format.name,
                "border-slate-700 hover:border-slate-600": selectedFormat !== format.name,
              }
            )}
          >
            <format.icon className="w-8 h-8 mb-2" />
            <span className="font-bold">{format.name}</span>
          </div>
        ))}
      </div>
    </section>
  );
};

export default ExportFormatSelector;
