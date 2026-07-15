/**
 * Server-side pagination chrome for report results.
 */
import { TablePager } from "@/components/master-table-kit";

type Props = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
};

export function ReportPagination({ page, pageSize, total, onPageChange }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(pageSize, 1)));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const startIdx = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endIdx = Math.min(currentPage * pageSize, total);

  return (
    <TablePager
      totalPages={totalPages}
      currentPage={currentPage}
      setPage={onPageChange}
      startIdx={startIdx}
      endIdx={endIdx}
      total={total}
    />
  );
}
