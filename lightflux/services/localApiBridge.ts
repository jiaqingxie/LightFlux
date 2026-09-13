import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { executeLocalRequest, LocalRequest } from "./localWorkspace";
import {
  flushAppState,
  persistedState,
  persistedStoreSlice,
  useTodoStore,
} from "../store/todoStore";

export const handleLocalRequest = async (request: LocalRequest) => {
  await useTodoStore.getState().hydrate();
  const store = useTodoStore.getState();
  if (!store.persistenceReady)
    throw new Error(
      "Local data is not ready; recover or import a backup first.",
    );
  const current = persistedState(store);
  const transaction = executeLocalRequest(current, request);
  if (transaction.state !== current) {
    useTodoStore.setState(persistedStoreSlice(transaction.state));
  }
  // Replayed writes also flush: a previous response may have failed during save.
  if (request.method !== "GET") await flushAppState();
  return transaction.result;
};

export const listenForLocalApi = async (): Promise<() => void> => {
  if (!isTauri()) return () => {};
  let queue: Promise<unknown> = Promise.resolve();
  return listen<LocalRequest & { id: string }>(
    "lightflux://local-api",
    ({ payload }) => {
      queue = queue
        .catch(() => undefined)
        .then(async () => {
          let reply;
          try {
            reply = { status: 200, body: await handleLocalRequest(payload) };
          } catch (error) {
            const failure = error as Error & {
              status?: number;
              code?: string;
              currentTask?: unknown;
              currentMilestone?: unknown;
            };
            reply = {
              status: failure.status ?? 500,
              body: {
                error: failure.message,
                code: failure.code,
                currentTask: failure.currentTask,
                currentMilestone: failure.currentMilestone,
              },
            };
          }
          await invoke("reply_local_api", { id: payload.id, reply });
        });
    },
  );
};
