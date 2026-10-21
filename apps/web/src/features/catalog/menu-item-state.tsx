import {
  type ConfigDraft,
  type Configuration,
  configurationSchema,
  instructionLimit,
  instructionText,
} from "@tablecast/api/schema";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useBlocker, useMatch, useNavigate, useRouter } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { addMenuItem, type MenuListSearch, type MenuSection } from "../configuration/menu-model";
import { configurationImageUploadKey, draftOptions } from "../configuration/menu-query";
import { useStore } from "../store/store-context";
import { catalogOptions } from "./catalog-query";
import { focusInvalidCondition } from "./menu-item-dom";

type ConditionError =
  | "condition_configuration_limit"
  | "condition_invalid"
  | "condition_product_limit"
  | null;

type EditorState = {
  conditionError: ConditionError;
  configuration: Configuration;
  initial: Configuration;
  newSaved: boolean;
  version: number;
};

function conditionValidationMessage(configuration: Configuration): ConditionError {
  const issues = configurationSchema.safeParse(configuration).error?.issues ?? [];
  if (issues.some((issue) => issue.message === "CONDITION_PRODUCT_LIMIT"))
    return "condition_product_limit";
  if (issues.some((issue) => issue.message === "CONDITION_CONFIGURATION_LIMIT"))
    return "condition_configuration_limit";
  return issues.some((issue) => issue.path.includes("conditions")) ? "condition_invalid" : null;
}

export function useItemEditing({
  section,
  itemId,
  initialConfiguration,
  draft,
  search,
}: {
  draft: ConfigDraft;
  initialConfiguration: Configuration;
  itemId: string;
  search: MenuListSearch;
  section: MenuSection;
}) {
  const store = useStore();
  const storeId = store.id;
  const { locale, t } = useI18n();
  const client = useQueryClient();
  const images = useImageEdits(storeId);
  const navigate = useNavigate();
  const router = useRouter();
  const routeId = useMatch({ strict: false, select: (match) => match.routeId });
  const [newId] = useState(() => crypto.randomUUID());
  const selectedId = itemId === "new" ? newId : itemId;
  const editable =
    (draft.status === "draft" || draft.status === "ready") &&
    (store.role === "owner" || store.role === "admin");
  const catalog = useQuery(catalogOptions(storeId));
  // 設定全体の編集状態を保持し、再帰した条件をフォームの全深層キーへ展開しない。
  const [editor, setEditor] = useState<EditorState>(() => {
    const initial =
      itemId === "new"
        ? addMenuItem(initialConfiguration, section, selectedId)
        : initialConfiguration;
    return {
      initial,
      configuration: initial,
      version: draft.version,
      newSaved: false,
      conditionError: null,
    };
  });
  const { initial, configuration, version, newSaved, conditionError } = editor;
  const setConfiguration = (update: React.SetStateAction<Configuration>) =>
    setEditor((current) => ({
      ...current,
      configuration: typeof update === "function" ? update(current.configuration) : update,
    }));
  const dirty = configuration !== initial;
  const invalidInstructions = Object.values(configuration.cast.instructions).some(
    (instruction) => instructionText(instruction).length > instructionLimit,
  );
  async function submitConfiguration(form: HTMLFormElement) {
    if (!editable || invalidInstructions || images.uploadingNow() || pending) return;
    const failure = conditionValidationMessage(configuration);
    setEditor((current) => ({ ...current, conditionError: failure }));
    if (failure) {
      focusInvalidCondition(form, failure !== "condition_invalid");
      return;
    }
    await save.mutateAsync(configuration).catch(() => undefined);
  }
  const hasUnsavedChanges = () =>
    editable && (dirty || images.staged.current.size > 0 || (itemId === "new" && !newSaved));
  useBlocker({
    shouldBlockFn: () =>
      images.uploadingNow() || (hasUnsavedChanges() && !window.confirm(t("menu_leave_unsaved"))),
    enableBeforeUnload: () => images.uploadingNow() || hasUnsavedChanges(),
  });
  const save = useMutation({
    mutationFn: (nextConfiguration: Configuration) => {
      return parseResponse(
        rpc.api.admin.stores[":storeId"].drafts[":id"].$put({
          param: { storeId, id: draft.id },
          json: {
            expectedVersion: version,
            configuration: nextConfiguration,
            instructionFormatVersion: 1,
          },
        }),
      );
    },
    onSuccess: (next) => {
      setEditor({
        initial: next.configuration,
        configuration: next.configuration,
        version: next.version,
        newSaved: true,
        conditionError: null,
      });
      client.setQueryData(draftOptions(storeId, next.id).queryKey, next);
      void client.invalidateQueries({ queryKey: ["tablecast-drafts", storeId] });
      void client.invalidateQueries({ queryKey: ["tablecast-draft-choices", storeId] });
      if (itemId === "new")
        void navigate({
          to: "/admin/stores/$storeId/menu/changes/$draftId/$section/$itemId",
          params: { storeId, draftId: next.id, section, itemId: selectedId },
          replace: true,
          search,
        });
      else void router.invalidate({ filter: (match) => match.routeId === routeId });
    },
  });
  const reload = useMutation({
    mutationFn: () => client.fetchQuery({ ...draftOptions(storeId, draft.id), staleTime: 0 }),
    onSuccess: (next) => {
      setEditor((current) => ({
        ...current,
        initial: next.configuration,
        configuration: next.configuration,
        version: next.version,
        conditionError: null,
      }));
      client.setQueryData(draftOptions(storeId, next.id).queryKey, next);
      images.reset();
      save.reset();
      void router.invalidate({ filter: (match) => match.routeId === routeId });
    },
  });
  const pending = save.isPending || reload.isPending;
  const remove = useMutation({
    mutationFn: async () => {
      if (section === "cast") return;
      await save.mutateAsync({
        ...configuration,
        [section]: configuration[section].filter((item) => item.id !== selectedId),
      });
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["tablecast-drafts", storeId] });
      void navigate({
        to: "/admin/stores/$storeId/menu/changes/$draftId/$section",
        params: { storeId, draftId: draft.id, section },
        search,
      });
    },
  });
  const item =
    section === "cast" ? null : initial[section].find((value) => value.id === selectedId);
  return {
    store,
    storeId,
    locale,
    t,
    selectedId,
    editable,
    catalog,
    initial,
    configuration,
    version,
    newSaved,
    conditionError,
    setEditor,
    setConfiguration,
    dirty,
    invalidInstructions,
    submitConfiguration,
    save,
    reload,
    pending,
    remove,
    images,
    item,
  };
}

function useImageEdits(storeId: string) {
  const client = useQueryClient();
  const uploading = useIsMutating({ mutationKey: configurationImageUploadKey(storeId) }) > 0;
  const staged = useRef(new Set<string>());
  const [hasStaged, setHasStaged] = useState(false);
  const [fieldKey, setFieldKey] = useState(0);
  const onStagedChange = useCallback((id: string, isStaged: boolean) => {
    if (isStaged) staged.current.add(id);
    else staged.current.delete(id);
    setHasStaged(staged.current.size > 0);
  }, []);
  return {
    uploading,
    uploadingNow: () =>
      client.isMutating({ mutationKey: configurationImageUploadKey(storeId) }) > 0,
    staged,
    hasStaged,
    onStagedChange,
    fieldKey,
    reset: () => {
      staged.current.clear();
      setHasStaged(false);
      setFieldKey((key) => key + 1);
    },
  };
}
