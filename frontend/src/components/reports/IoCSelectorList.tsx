import { getHistory } from "@/services/api";
import { QueryHistoryItem, RiskLevel } from "@/types";
import { useEffect, useState } from "react";
import { Checkbox } from "../ui/checkbox";
import clsx from "clsx";
import { Badge } from "../ui/badge";

const getRiskLevelClass = (risk: RiskLevel | null) => {
    if (risk === 'CRITICAL') return 'bg-red-500/20 text-red-400 border-red-500/30';
    if (risk === 'HIGH') return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    if (risk === 'MEDIUM') return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    if (risk === 'LOW') return 'bg-sky-500/20 text-sky-400 border-sky-500/30';
    return 'bg-slate-600/50 text-slate-300 border-slate-600/80';
};

interface IoCSelectorListProps {
    selectedIocs: QueryHistoryItem[];
    onSelectionChange: (iocs: QueryHistoryItem[]) => void;
}

const IoCSelectorList = ({ selectedIocs, onSelectionChange }: IoCSelectorListProps) => {
    const [history, setHistory] = useState<QueryHistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const selectedIds = new Set(selectedIocs.map(ioc => ioc.id));
  
    useEffect(() => {
      const fetchHistory = async () => {
        try {
          setLoading(true);
          const paginatedHistory = await getHistory(1, 100);
          setHistory(paginatedHistory.items);
        } catch (error) {
          console.error("Failed to fetch history", error);
        } finally {
          setLoading(false);
        }
      };
      fetchHistory();
    }, []);

    const handleToggleSelection = (item: QueryHistoryItem) => {
        const newSelection = new Map(selectedIocs.map(ioc => [ioc.id, ioc]));
        if (newSelection.has(item.id)) {
          newSelection.delete(item.id);
        } else {
          newSelection.set(item.id, item);
        }
        onSelectionChange(Array.from(newSelection.values()));
      };
    
      const handleSelectAll = () => {
        if (selectedIds.size === history.length) {
            onSelectionChange([]);
        } else {
            onSelectionChange(history);
        }
      };

    return (
      <section>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">2. Select IoCs</h2>
          <div>
            <span className="bg-slate-700 text-slate-300 text-xs font-medium me-2 px-2.5 py-0.5 rounded-full">
              {selectedIds.size} selected
            </span>
            <button onClick={handleSelectAll} className="text-sm text-iris-400 hover:underline">
              {selectedIds.size === history.length ? "Deselect all" : "Select all"}
            </button>
          </div>
        </div>
        <div className="space-y-2 max-h-60 overflow-y-auto pr-2 border-t border-slate-800 pt-2">
            {loading && <p className="text-center text-slate-400 p-8">Loading history...</p>}
            {!loading && history.length === 0 && <p className="text-center text-slate-400 p-8">Query history is empty.</p>}
            {history.map((item) => (
                <div
                    key={item.id}
                    onClick={() => handleToggleSelection(item)}
                    className={clsx(
                        "flex items-center p-2 rounded-lg cursor-pointer border-2 transition-all",
                        selectedIds.has(item.id)
                        ? "border-iris-500 bg-iris-500/10"
                        : "border-transparent hover:bg-slate-800/60"
                    )}
                >
                    <Checkbox
                        checked={selectedIds.has(item.id)}
                        onCheckedChange={() => handleToggleSelection(item)}
                        className="me-4"
                    />
                    <div className="flex-grow font-mono text-sm">{item.iocValue}</div>
                    <Badge variant="outline" className="mx-2">{item.iocType.toUpperCase()}</Badge>
                    <Badge className={clsx("w-20 justify-center", getRiskLevelClass(item.riskLevel))}>
                        {item.riskLevel || 'N/A'}
                    </Badge>
                    <div className="w-16 text-right font-bold text-sm pr-2">{item.riskScore ?? "-"}</div>
                </div>
            ))}
        </div>
      </section>
    );
  };
  
  export default IoCSelectorList;
  