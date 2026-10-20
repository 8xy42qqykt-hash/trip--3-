declare module 'npm:web-push@3.6.7' {
  const webPush: {
    setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
    sendNotification(
      subscription: Record<string, unknown>,
      payload: string,
      options?: { TTL?: number; urgency?: string },
    ): Promise<unknown>;
  };
  export default webPush;
}
