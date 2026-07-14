import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldWrapper, MasterBreadcrumb } from "@/components/master-table-kit";
import { MasterLookupDialog } from "@/components/master-lookup-dialog";
import { type LookupKey, type LookupOption } from "@/lib/master-lookups";
import { useAuth } from "@/lib/auth";
import { toErrorMessage } from "@/lib/masters/screen";
import { addTrackingComment, addTrackingProgress } from "@/lib/transactions/resources/tracking";
import { trackingCommentSchema, trackingProgressSchema } from "@/lib/transactions/schemas/tracking";

type LookupPair = { code: string; name: string };
type TabMode = "progress" | "comment";

type ProgressForm = {
  progressDate: string;
  progressTime: string;
  status: LookupPair;
  deliveryRemark: string;
  serviceCentre: LookupPair;
  awbNo: string;
  allowAddOnceDelivered: boolean;
};

type CommentForm = {
  commentDate: string;
  commentTime: string;
  awbNo: string;
  comment: string;
};

type ProgressRecord = ProgressForm & { id: string; savedAt: string };
type CommentRecord = CommentForm & { id: string; savedAt: string };

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const nowTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
};

const emptyPair = (): LookupPair => ({ code: "", name: "" });

const emptyProgressForm = (): ProgressForm => ({
  progressDate: todayIso(),
  progressTime: nowTime(),
  status: emptyPair(),
  deliveryRemark: "",
  serviceCentre: { code: "HYD", name: "HYDERABAD" },
  awbNo: "",
  allowAddOnceDelivered: false,
});

const emptyCommentForm = (): CommentForm => ({
  commentDate: todayIso(),
  commentTime: nowTime(),
  awbNo: "",
  comment: "",
});

export const Route = createFileRoute("/transaction/tracking/progress-comment")({
  head: () => ({
    meta: [
      { title: "Progress / Comment — Transaction — Courier ERP" },
      {
        name: "description",
        content: "Add shipment progress updates and comments for AWB tracking.",
      },
    ],
  }),
  component: ProgressCommentPage,
});

function ProgressCommentPage() {
  const { isAuthenticated: authed } = useAuth();
  const [mode, setMode] = useState<TabMode>("progress");
  const [progressForm, setProgressForm] = useState<ProgressForm>(emptyProgressForm());
  const [commentForm, setCommentForm] = useState<CommentForm>(emptyCommentForm());
  const [progressRecords, setProgressRecords] = useState<ProgressRecord[]>([]);
  const [commentRecords, setCommentRecords] = useState<CommentRecord[]>([]);
  const [saving, setSaving] = useState(false);

  const patchProgress = (patch: Partial<ProgressForm>) =>
    setProgressForm((f) => ({ ...f, ...patch }));

  const patchComment = (patch: Partial<CommentForm>) => setCommentForm((f) => ({ ...f, ...patch }));

  const switchMode = (next: TabMode) => {
    setMode(next);
  };

  const handleProgressSave = async () => {
    if (!progressForm.progressDate.trim()) return toast.error("Progress Date is required");
    if (!progressForm.progressTime.trim()) return toast.error("Progress Time is required");
    if (!progressForm.status.code.trim() && !progressForm.status.name.trim()) {
      return toast.error("Status is required");
    }
    if (!progressForm.serviceCentre.code.trim() && !progressForm.serviceCentre.name.trim()) {
      return toast.error("Service Centre is required");
    }
    const awb = progressForm.awbNo.trim();
    if (!awb) return toast.error("AWB No. is required");

    if (!authed) {
      setProgressRecords((prev) => [
        {
          ...progressForm,
          awbNo: awb,
          id: crypto.randomUUID(),
          savedAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      patchProgress({ awbNo: "", deliveryRemark: "" });
      return toast.success(`Progress saved for AWB ${awb} (demo)`);
    }

    const parsed = trackingProgressSchema.safeParse({
      event_date: progressForm.progressDate,
      event_time: progressForm.progressTime,
      exception_code: progressForm.status.code || undefined,
      status_text: progressForm.status.name || progressForm.status.code || undefined,
      service_center_code: progressForm.serviceCentre.code || undefined,
      remark: progressForm.deliveryRemark || undefined,
      allow_if_delivered: progressForm.allowAddOnceDelivered,
    });
    if (!parsed.success) {
      return toast.error(parsed.error.issues[0]?.message ?? "Invalid progress fields");
    }

    setSaving(true);
    try {
      await addTrackingProgress({ awb_no: awb, fields: parsed.data });
      setProgressRecords((prev) => [
        {
          ...progressForm,
          awbNo: awb,
          id: crypto.randomUUID(),
          savedAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      patchProgress({ awbNo: "", deliveryRemark: "" });
      toast.success(`Progress saved for AWB ${awb}`);
    } catch (err) {
      toast.error(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleProgressReset = () => {
    setProgressForm(emptyProgressForm());
    toast.success("Progress form reset");
  };

  const handleCommentSave = async () => {
    if (!commentForm.commentDate.trim()) return toast.error("Comment Date is required");
    if (!commentForm.commentTime.trim()) return toast.error("Comment Time is required");
    const awb = commentForm.awbNo.trim();
    if (!awb) return toast.error("AWB No. is required");
    if (!commentForm.comment.trim()) return toast.error("Comment is required");

    if (!authed) {
      setCommentRecords((prev) => [
        {
          ...commentForm,
          awbNo: awb,
          id: crypto.randomUUID(),
          savedAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      patchComment({ awbNo: "", comment: "" });
      return toast.success(`Comment saved for AWB ${awb} (demo)`);
    }

    const parsed = trackingCommentSchema.safeParse({
      comment: commentForm.comment,
      commented_at: `${commentForm.commentDate}T${
        commentForm.commentTime.length === 4
          ? `${commentForm.commentTime.slice(0, 2)}:${commentForm.commentTime.slice(2)}:00`
          : "00:00:00"
      }`,
    });
    if (!parsed.success) {
      return toast.error(parsed.error.issues[0]?.message ?? "Invalid comment");
    }

    setSaving(true);
    try {
      await addTrackingComment({ awb_no: awb, fields: parsed.data });
      setCommentRecords((prev) => [
        {
          ...commentForm,
          awbNo: awb,
          id: crypto.randomUUID(),
          savedAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      patchComment({ awbNo: "", comment: "" });
      toast.success(`Comment saved for AWB ${awb}`);
    } catch (err) {
      toast.error(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleCommentReset = () => {
    setCommentForm(emptyCommentForm());
    toast.success("Comment form reset");
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Transaction", "Tracking / Delivery", "Progress / Comment"]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Progress / Comment
        </h1>
        <p className="text-sm text-muted-foreground">
          Record shipment progress events or add comments against an AWB number.
          {authed ? " Connected to live backend." : " Demo mode — sign in for live tracking."}
        </p>
      </div>

      <Card className="min-w-0 overflow-hidden border p-4 md:p-6">
        <div className="mb-4 flex h-9 w-fit overflow-hidden rounded-md border">
          <Button
            type="button"
            variant="ghost"
            className={cn(
              "h-9 rounded-none px-6 text-sm",
              mode === "progress"
                ? "bg-emerald-600 text-white hover:bg-emerald-600/90 hover:text-white"
                : "text-emerald-700 hover:bg-muted/50",
            )}
            onClick={() => switchMode("progress")}
          >
            Progress
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={cn(
              "h-9 rounded-none border-l px-6 text-sm",
              mode === "comment"
                ? "bg-emerald-600 text-white hover:bg-emerald-600/90 hover:text-white"
                : "text-emerald-700 hover:bg-muted/50",
            )}
            onClick={() => switchMode("comment")}
          >
            Comment
          </Button>
        </div>

        {mode === "progress" ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <FieldWrapper label="Progress Date" required>
                <Input
                  type="date"
                  value={progressForm.progressDate}
                  onChange={(e) => patchProgress({ progressDate: e.target.value })}
                />
              </FieldWrapper>
              <FieldWrapper label="Progress Time" required>
                <Input
                  value={progressForm.progressTime}
                  onChange={(e) =>
                    patchProgress({ progressTime: e.target.value.replace(/\D/g, "").slice(0, 4) })
                  }
                  placeholder="HHmm"
                />
              </FieldWrapper>
              <FieldWrapper label="Status" required>
                <NameCodeLookupInput
                  lookup="exception"
                  value={progressForm.status}
                  onChange={(status) => patchProgress({ status })}
                />
              </FieldWrapper>
              <FieldWrapper label="Delivery Remark">
                <Input
                  value={progressForm.deliveryRemark}
                  onChange={(e) => patchProgress({ deliveryRemark: e.target.value })}
                />
              </FieldWrapper>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <FieldWrapper label="Service Centre" required>
                <LookupPairInput
                  lookup="serviceCentre"
                  value={progressForm.serviceCentre}
                  onChange={(serviceCentre) => patchProgress({ serviceCentre })}
                />
              </FieldWrapper>
              <FieldWrapper label="AWB No." required>
                <Input
                  value={progressForm.awbNo}
                  onChange={(e) => patchProgress({ awbNo: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleProgressSave();
                    }
                  }}
                />
              </FieldWrapper>
              <FieldWrapper
                label="Allow Add Progress Once Delivered"
                className="md:col-span-2 xl:col-span-2"
              >
                <label className="flex h-9 items-center gap-2">
                  <Checkbox
                    checked={progressForm.allowAddOnceDelivered}
                    onCheckedChange={(checked) =>
                      patchProgress({ allowAddOnceDelivered: checked === true })
                    }
                  />
                  <span className="text-sm text-muted-foreground">
                    Allow Add Progress Once Delivered
                  </span>
                </label>
              </FieldWrapper>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                onClick={() => void handleProgressSave()}
                disabled={saving}
                className="min-w-24 bg-emerald-600 text-white hover:bg-emerald-600/90"
              >
                Save
              </Button>
              <Button variant="destructive" onClick={handleProgressReset} className="min-w-24">
                Reset
              </Button>
            </div>

            {progressRecords.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                {progressRecords.length} progress record(s) saved this session.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <FieldWrapper label="Comment Date" required>
                <Input
                  type="date"
                  value={commentForm.commentDate}
                  onChange={(e) => patchComment({ commentDate: e.target.value })}
                />
              </FieldWrapper>
              <FieldWrapper label="Comment Time" required>
                <Input
                  value={commentForm.commentTime}
                  onChange={(e) =>
                    patchComment({ commentTime: e.target.value.replace(/\D/g, "").slice(0, 4) })
                  }
                  placeholder="HHmm"
                />
              </FieldWrapper>
              <FieldWrapper label="AWB No." required>
                <Input
                  value={commentForm.awbNo}
                  onChange={(e) => patchComment({ awbNo: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleCommentSave();
                    }
                  }}
                />
              </FieldWrapper>
              <FieldWrapper label="Comment" required>
                <Input
                  value={commentForm.comment}
                  onChange={(e) => patchComment({ comment: e.target.value })}
                />
              </FieldWrapper>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                onClick={() => void handleCommentSave()}
                disabled={saving}
                className="min-w-24 bg-emerald-600 text-white hover:bg-emerald-600/90"
              >
                Save
              </Button>
              <Button variant="destructive" onClick={handleCommentReset} className="min-w-24">
                Reset
              </Button>
            </div>

            {commentRecords.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                {commentRecords.length} comment record(s) saved this session.
              </p>
            ) : null}
          </div>
        )}
      </Card>
    </div>
  );
}

function NameCodeLookupInput({
  value,
  onChange,
  lookup,
}: {
  value: LookupPair;
  onChange: (v: LookupPair) => void;
  lookup: LookupKey;
}) {
  const [lookupOpen, setLookupOpen] = useState(false);

  return (
    <>
      <div className="flex gap-1">
        <Input
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          className="min-w-0 flex-1"
          placeholder="Name"
        />
        <Input
          value={value.code}
          onChange={(e) => onChange({ ...value, code: e.target.value })}
          className="w-20"
          placeholder="Code"
        />
        <Button
          size="icon"
          variant="outline"
          className="h-9 w-9 shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
          aria-label="Search"
          onClick={() => setLookupOpen(true)}
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>
      <MasterLookupDialog
        open={lookupOpen}
        onOpenChange={setLookupOpen}
        lookup={lookup}
        returnField="code"
        onSelect={(_v, option: LookupOption) => onChange({ code: option.code, name: option.name })}
      />
    </>
  );
}

function LookupPairInput({
  value,
  onChange,
  lookup,
}: {
  value: LookupPair;
  onChange: (v: LookupPair) => void;
  lookup: LookupKey;
}) {
  const [lookupOpen, setLookupOpen] = useState(false);

  return (
    <>
      <div className="flex gap-1">
        <Input
          value={value.code}
          onChange={(e) => onChange({ ...value, code: e.target.value })}
          className="w-24"
          placeholder="Code"
        />
        <Input
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          className="min-w-0 flex-1"
          placeholder="Name"
        />
        <Button
          size="icon"
          variant="outline"
          className="h-9 w-9 shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
          aria-label="Search"
          onClick={() => setLookupOpen(true)}
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>
      <MasterLookupDialog
        open={lookupOpen}
        onOpenChange={setLookupOpen}
        lookup={lookup}
        returnField="code"
        onSelect={(_v, option: LookupOption) => onChange({ code: option.code, name: option.name })}
      />
    </>
  );
}
