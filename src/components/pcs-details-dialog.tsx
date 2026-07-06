import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FieldWrapper } from "@/components/master-table-kit";

const MEASUREMENT_UNITS = ["Centimeter", "Inch"] as const;

type PiecesDraft = {
  measurementUnit: string;
  actualWeightPerPc: string;
  noOfPieces: string;
  length: string;
  width: string;
  height: string;
  division: string;
  volWeight: string;
  chargeWeight: string;
};

export type PiecesLine = {
  id: string;
  childAwb: string;
  actualWeightPerPc: string;
  pieces: string;
  length: string;
  breadth: string;
  height: string;
  volWeight: string;
  chargeWeight: string;
};

const emptyPiecesDraft = (): PiecesDraft => ({
  measurementUnit: "Centimeter",
  actualWeightPerPc: "0",
  noOfPieces: "1",
  length: "0",
  width: "0",
  height: "0",
  division: "5000",
  volWeight: "0",
  chargeWeight: "0",
});

const calcVolWeight = (draft: PiecesDraft) => {
  const l = Number.parseFloat(draft.length) || 0;
  const w = Number.parseFloat(draft.width) || 0;
  const h = Number.parseFloat(draft.height) || 0;
  const pcs = Number.parseFloat(draft.noOfPieces) || 0;
  const div = Number.parseFloat(draft.division) || 5000;
  if (!l || !w || !h || !pcs || !div) return "0";
  return ((l * w * h * pcs) / div).toFixed(2);
};

const calcChargeWeight = (draft: PiecesDraft) => {
  const vol = Number.parseFloat(calcVolWeight(draft)) || 0;
  const act = (Number.parseFloat(draft.actualWeightPerPc) || 0) * (Number.parseFloat(draft.noOfPieces) || 0);
  return Math.max(vol, act).toFixed(2);
};

const sumChargeWeight = (lines: PiecesLine[]) =>
  lines.reduce((sum, line) => sum + (Number.parseFloat(line.chargeWeight) || 0), 0).toFixed(2);

type PcsDetailsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (volWeight: string, lines: PiecesLine[]) => void;
  initialLines?: PiecesLine[];
};

export function PcsDetailsDialog({ open, onOpenChange, onApply, initialLines = [] }: PcsDetailsDialogProps) {
  const [piecesDraft, setPiecesDraft] = useState<PiecesDraft>(emptyPiecesDraft);
  const [lines, setLines] = useState<PiecesLine[]>(initialLines);

  useEffect(() => {
    if (open) {
      setLines(initialLines);
      setPiecesDraft(emptyPiecesDraft());
    }
  }, [open, initialLines]);

  const patchPiecesDraft = (patch: Partial<PiecesDraft>) => {
    setPiecesDraft((d) => {
      const next = { ...d, ...patch };
      if ("measurementUnit" in patch) {
        next.division = patch.measurementUnit === "Inch" ? "139" : "5000";
      }
      next.volWeight = calcVolWeight(next);
      next.chargeWeight = calcChargeWeight(next);
      return next;
    });
  };

  const addPiecesLine = () => {
    if (!piecesDraft.noOfPieces.trim()) return toast.error("No. Of Pieces is required");
    const line: PiecesLine = {
      id: crypto.randomUUID(),
      childAwb: "",
      actualWeightPerPc: piecesDraft.actualWeightPerPc,
      pieces: piecesDraft.noOfPieces,
      length: piecesDraft.length,
      breadth: piecesDraft.width,
      height: piecesDraft.height,
      volWeight: piecesDraft.volWeight,
      chargeWeight: piecesDraft.chargeWeight,
    };
    setLines((prev) => [...prev, line]);
    setPiecesDraft(emptyPiecesDraft());
    toast.success("Piece line added");
  };

  const removePiecesLine = (id: string) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const handleClose = () => {
    const volWeight = sumChargeWeight(lines);
    onApply(volWeight, lines);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] gap-0 overflow-hidden p-0 sm:max-w-6xl">
        <div className="bg-sidebar px-4 py-3">
          <DialogTitle className="text-base font-semibold text-sidebar-foreground">Enter PCS Details</DialogTitle>
        </div>

        <div className="space-y-4 p-4 md:p-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-10">
            <FieldWrapper label="Measurement Unit">
              <Select value={piecesDraft.measurementUnit} onValueChange={(v) => patchPiecesDraft({ measurementUnit: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEASUREMENT_UNITS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldWrapper>
            <FieldWrapper label="Actl Weight/PCS">
              <Input
                value={piecesDraft.actualWeightPerPc}
                onChange={(e) => patchPiecesDraft({ actualWeightPerPc: e.target.value })}
                inputMode="decimal"
              />
            </FieldWrapper>
            <FieldWrapper label="No. Of Pieces">
              <Input
                value={piecesDraft.noOfPieces}
                onChange={(e) => patchPiecesDraft({ noOfPieces: e.target.value })}
                inputMode="numeric"
              />
            </FieldWrapper>
            <FieldWrapper label="Length">
              <Input value={piecesDraft.length} onChange={(e) => patchPiecesDraft({ length: e.target.value })} inputMode="decimal" />
            </FieldWrapper>
            <FieldWrapper label="Width">
              <Input value={piecesDraft.width} onChange={(e) => patchPiecesDraft({ width: e.target.value })} inputMode="decimal" />
            </FieldWrapper>
            <FieldWrapper label="Height">
              <Input value={piecesDraft.height} onChange={(e) => patchPiecesDraft({ height: e.target.value })} inputMode="decimal" />
            </FieldWrapper>
            <FieldWrapper label="Division">
              <Input value={piecesDraft.division} onChange={(e) => patchPiecesDraft({ division: e.target.value })} inputMode="decimal" />
            </FieldWrapper>
            <FieldWrapper label="Vol Weight">
              <Input value={piecesDraft.volWeight} readOnly className="bg-muted/30" />
            </FieldWrapper>
            <FieldWrapper label="Chrg Weight">
              <Input value={piecesDraft.chargeWeight} readOnly className="bg-muted/30" />
            </FieldWrapper>
            <FieldWrapper label=" ">
              <Button
                type="button"
                className="w-full bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
                onClick={addPiecesLine}
              >
                <Plus className="mr-1 h-4 w-4" />
                Add
              </Button>
            </FieldWrapper>
          </div>

          <div className="flex justify-end">
            <Button type="button" variant="destructive" onClick={handleClose}>
              Close
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] caption-bottom text-sm">
              <TableHeader>
                <TableRow className="bg-sidebar hover:bg-sidebar">
                  {[
                    "Child AWB",
                    "Actl Weight/PCS",
                    "Pieces",
                    "Length",
                    "Breadth",
                    "Height",
                    "Volumetric Weight",
                    "Charge Weight",
                    "Action",
                  ].map((h) => (
                    <TableHead key={h} className="text-sidebar-foreground">
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-16 text-center text-muted-foreground">
                      No piece lines added
                    </TableCell>
                  </TableRow>
                ) : (
                  lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>{line.childAwb || "—"}</TableCell>
                      <TableCell>{line.actualWeightPerPc}</TableCell>
                      <TableCell>{line.pieces}</TableCell>
                      <TableCell>{line.length}</TableCell>
                      <TableCell>{line.breadth}</TableCell>
                      <TableCell>{line.height}</TableCell>
                      <TableCell>{line.volWeight}</TableCell>
                      <TableCell>{line.chargeWeight}</TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive"
                          onClick={() => removePiecesLine(line.id)}
                          aria-label="Delete piece line"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
