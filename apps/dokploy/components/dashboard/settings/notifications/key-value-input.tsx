import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface KeyValuePair {
  key: string;
  value: string;
  enabled: boolean;
}

interface KeyValueInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label: string;
  description?: string;
}

const createEmptyPair = (): KeyValuePair => ({
  key: "",
  value: "",
  enabled: true,
});

const parseJsonToPairs = (jsonString: string): KeyValuePair[] => {
  try {
    const parsed = JSON.parse(jsonString);
    const pairs = Object.entries(parsed).map(([key, val]) => ({
      key,
      value: String(val),
      enabled: true,
    }));
    return pairs.length > 0 ? pairs : [createEmptyPair()];
  } catch {
    return [createEmptyPair()];
  }
};

const convertPairsToJson = (pairs: KeyValuePair[]): string => {
  const enabledPairs = pairs.filter((pair) => pair.enabled && pair.key.trim());

  if (enabledPairs.length === 0) {
    return "";
  }

  const obj = enabledPairs.reduce((acc, pair) => {
    acc[pair.key.trim()] = pair.value;
    return acc;
  }, {} as Record<string, string>);

  return JSON.stringify(obj, null, 2);
};

export const KeyValueInput = ({
  value,
  onChange,
  label,
  description,
}: KeyValueInputProps) => {
  const [pairs, setPairs] = useState<KeyValuePair[]>([]);

  useEffect(() => {
    const newPairs = value ? parseJsonToPairs(value) : [createEmptyPair()];
    setPairs(newPairs);
  }, [value]);

  const syncPairsWithParent = (newPairs: KeyValuePair[]) => {
    setPairs(newPairs);
    onChange(convertPairsToJson(newPairs));
  };

  const addPair = () => {
    syncPairsWithParent([...pairs, createEmptyPair()]);
  };

  const removePair = (index: number) => {
    const filteredPairs = pairs.filter((_, i) => i !== index);
    syncPairsWithParent(filteredPairs);
  };

  const updatePair = (
    index: number,
    field: keyof KeyValuePair,
    newValue: string | boolean
  ) => {
    const updatedPairs = pairs.map((pair, i) =>
      i === index ? { ...pair, [field]: newValue } : pair
    );
    syncPairsWithParent(updatedPairs);
  };

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-sm font-medium">{label}</Label>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>

      <div className="space-y-2">
        {pairs.map((pair, index) => (
          <div
            key={index}
            className="flex items-center gap-2 p-2 border rounded-md bg-muted/50"
          >
            <div className="flex items-center">
              <Checkbox
                checked={pair.enabled}
                onCheckedChange={(checked) =>
                  updatePair(index, "enabled", checked)
                }
                className="mr-2"
              />
            </div>
            <div className="flex-1">
              <Input
                placeholder="Key"
                value={pair.key}
                onChange={(e) => updatePair(index, "key", e.target.value)}
                className="text-sm"
                disabled={!pair.enabled}
              />
            </div>
            <div className="flex-[2]">
              <Input
                placeholder="Value"
                value={pair.value}
                onChange={(e) => updatePair(index, "value", e.target.value)}
                className="text-sm"
                disabled={!pair.enabled}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removePair(index)}
              className="text-red-500 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addPair}
        className="w-full"
      >
        <Plus className="h-4 w-4 mr-2" />
        Add {label.toLowerCase()}
      </Button>
    </div>
  );
};
