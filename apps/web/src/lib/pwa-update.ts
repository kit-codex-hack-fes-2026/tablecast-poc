// 全画面の応答が揃うまで旧Service Workerを維持する。
export async function preparePwaClients(
  clients: ReadonlyArray<{
    id: string;
    postMessage: (message: unknown, transfer: Transferable[]) => void;
  }>,
  type = "TABLECAST_CHECK_UPDATE",
): Promise<boolean> {
  if (!clients.length) return true;
  const answers = await Promise.all(
    clients.map(
      (client) =>
        new Promise<boolean>((resolve) => {
          const channel = new MessageChannel();
          const finish = (ready: boolean) => {
            clearTimeout(timer);
            channel.port1.close();
            resolve(ready);
          };
          const timer = setTimeout(() => finish(false), 3000);
          channel.port1.addEventListener(
            "message",
            (event: MessageEvent<unknown>) => finish(event.data === true),
            { once: true },
          );
          channel.port1.start();
          try {
            client.postMessage({ type }, [channel.port2]);
          } catch {
            channel.port2.close();
            finish(false);
          }
        }),
    ),
  );
  return answers.every(Boolean);
}
