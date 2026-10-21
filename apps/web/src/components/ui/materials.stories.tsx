import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { Check, Plus, Trash2 } from "lucide-react";
import { useI18n } from "../../i18n/locale";
import { Button } from "./button";
import { Badge } from "./badge";
import { Input } from "./input";
import { Table, TableHead, TableCell } from "./table";
function Materials() {
  const { locale } = useI18n();
  const ja = locale === "ja";
  return (
    <main className="mx-auto max-w-4xl space-y-8 rounded-2xl bg-background p-6">
      <h1>{ja ? "面と操作のデザイン" : "Surfaces and controls"}</h1>
      <section className="space-y-4 rounded-2xl bg-card p-6 shadow-surface">
        <h2>{ja ? "操作" : "Actions"}</h2>
        <div className="flex flex-wrap gap-3">
          <Button>
            <Plus />
            {ja ? "商品を追加" : "Add product"}
          </Button>
          <Button variant="outline">{ja ? "変更内容を確認" : "Review changes"}</Button>
          <Button variant="destructive">
            <Trash2 />
            {ja ? "削除" : "Delete"}
          </Button>
          <Button disabled>{ja ? "保存" : "Save"}</Button>
        </div>
        <label className="grid max-w-md gap-2">
          {ja ? "商品名" : "Product name"}
          <Input defaultValue={ja ? "季節のランチ" : "Seasonal lunch"} />
        </label>
      </section>
      <section className="space-y-4">
        <h2>{ja ? "状態と内容" : "Status and content"}</h2>
        <div className="flex flex-wrap gap-3">
          <Badge variant="success">
            <Check />
            {ja ? "公開中" : "Published"}
          </Badge>
          <Badge variant="warning">{ja ? "未保存" : "Unsaved"}</Badge>
          <Badge variant="destructive">{ja ? "保存できませんでした" : "Could not save"}</Badge>
        </div>
        <Table>
          <caption className="sr-only">{ja ? "商品の価格" : "Product prices"}</caption>
          <thead>
            <tr>
              <TableHead scope="col">{ja ? "商品" : "Product"}</TableHead>
              <TableHead scope="col" className="text-right">
                {ja ? "価格" : "Price"}
              </TableHead>
            </tr>
          </thead>
          <tbody>
            <tr>
              <TableCell>{ja ? "季節のランチ" : "Seasonal lunch"}</TableCell>
              <TableCell className="text-right tabular-nums">¥1,480</TableCell>
            </tr>
          </tbody>
        </Table>
      </section>
    </main>
  );
}
const meta = {
  title: "デザインシステム/質感と余白",
  component: Materials,
  tags: ["autodocs"],
} satisfies Meta<typeof Materials>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Japanese: Story = {};
export const English: Story = { globals: { locale: "en" } };
