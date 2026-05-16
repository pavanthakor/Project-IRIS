import { TLP } from "@/pages/ReportPage";

interface ReportDetailsProps {
    title: string;
    analyst: string;
    classification: TLP;
    onTitleChange: (value: string) => void;
    onAnalystChange: (value: string) => void;
    onClassificationChange: (value: TLP) => void;
}

const ReportDetails = ({ title, analyst, classification, onTitleChange, onAnalystChange, onClassificationChange }: ReportDetailsProps) => {
    return (
      <section>
        <h2 className="text-xl font-bold mb-4">4. Report Details</h2>
        <div className="space-y-4">
          <div>
            <label htmlFor="report-title" className="block text-sm font-medium text-slate-300 mb-1">
              Title
            </label>
            <input
              type="text"
              id="report-title"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-iris-500"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="report-analyst" className="block text-sm font-medium text-slate-300 mb-1">
              Analyst
            </label>
            <input
              type="text"
              id="report-analyst"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-iris-500"
              value={analyst}
              onChange={(e) => onAnalystChange(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="report-classification" className="block text-sm font-medium text-slate-300 mb-1">
              Classification
            </label>
            <select
              id="report-classification"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-iris-500"
              value={classification}
              onChange={(e) => onClassificationChange(e.target.value as TLP)}
            >
              <option>TLP:WHITE</option>
              <option>TLP:GREEN</option>
              <option>TLP:AMBER</option>
              <option>TLP:RED</option>
            </select>
          </div>
        </div>
      </section>
    );
  };
  
  export default ReportDetails;
  