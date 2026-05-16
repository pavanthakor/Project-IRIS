import { ReportSection } from "@/pages/ReportPage";
import { Switch } from "@/components/ui/switch";

const sectionDescriptions: Record<string, string> = {
    summary: "High-level findings for management",
    details: "Per-indicator breakdown",
    feed: "Raw data from each source",
    mitre: "Technique coverage",
    risk: "Weighted confidence chart",
    recommendations: "Suggested response actions",
    raw: "Full API responses",
};

interface ReportSectionsProps {
    sections: ReportSection[];
    onSectionsChange: (sections: ReportSection[]) => void;
}

const ReportSections = ({ sections, onSectionsChange }: ReportSectionsProps) => {

    const handleToggle = (id: string) => {
        const newSections = sections.map(s => 
            s.id === id ? { ...s, enabled: !s.enabled } : s
        );
        onSectionsChange(newSections);
    };

  return (
    <section>
      <h2 className="text-xl font-bold mb-4">3. Report Sections</h2>
      <div className="space-y-4">
        {sections.map((section) => (
          <div key={section.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
            <div>
              <label htmlFor={section.id} className="font-medium cursor-pointer">{section.label}</label>
              <p className="text-sm text-slate-400">{sectionDescriptions[section.id]}</p>
            </div>
            <Switch 
                id={section.id} 
                checked={section.enabled}
                onCheckedChange={() => handleToggle(section.id)}
                variant="iris"
            />
          </div>
        ))}
      </div>
    </section>
  );
};

export default ReportSections;
