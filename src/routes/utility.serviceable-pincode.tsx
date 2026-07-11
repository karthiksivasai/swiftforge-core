import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MasterBreadcrumb } from "@/components/master-table-kit";

type SearchMode = "pincode" | "name";

export const Route = createFileRoute("/utility/serviceable-pincode")({
  head: () => ({
    meta: [
      { title: "Serviceable Pincode — Utility — Courier ERP" },
      { name: "description", content: "Search serviceable pincodes by pincode or name." },
    ],
  }),
  component: ServiceablePincodePage,
});

function ServiceablePincodePage() {
  const [mode, setMode] = useState<SearchMode>("pincode");
  const [query, setQuery] = useState("");

  const handleSearch = () => {
    if (!query.trim()) {
      toast.error(`Enter ${mode === "pincode" ? "pincode" : "name"} to search`);
      return;
    }
    toast.success(`Searching serviceable pincodes by ${mode === "pincode" ? "pincode" : "name"}`);
  };

  const handleReset = () => {
    setMode("pincode");
    setQuery("");
    toast.success("Form reset");
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Utility", "Serviceable Pincode"]} />

      <Card className="min-w-0 overflow-hidden border p-4 md:p-6">
        <div className="mb-4">
          <span className="inline-flex rounded-full bg-sidebar px-3 py-0.5 text-sm font-medium text-sidebar-foreground">
            Serviceable Pincode
          </span>
        </div>

        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="flex shrink-0 gap-1">
            <Button
              type="button"
              size="sm"
              variant={mode === "pincode" ? "default" : "outline"}
              className={mode === "pincode" ? "bg-emerald-600 text-white hover:bg-emerald-600/90" : ""}
              onClick={() => setMode("pincode")}
            >
              By Pincode
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "name" ? "default" : "outline"}
              className={mode === "name" ? "bg-emerald-600 text-white hover:bg-emerald-600/90" : ""}
              onClick={() => setMode("name")}
            >
              By Name
            </Button>
          </div>

          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="md:max-w-sm"
            placeholder={mode === "pincode" ? "Enter pincode" : "Enter name"}
          />

          <div className="flex gap-3">
            <Button onClick={handleSearch} className="min-w-24 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90">
              Search
            </Button>
            <Button variant="destructive" onClick={handleReset} className="min-w-24">
              Reset
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
