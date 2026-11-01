"use client";

import { Gate } from "@/components/LiffProvider";

export default function MyIdPage() {
  return (
    <Gate>
      {(me) => (
        <main className="container">
          <div className="card" style={{ marginTop: 24 }}>
            <h2 style={{ fontSize: 17, marginTop: 0 }}>あなたのLINEユーザーID</h2>
            <div className="mono">{me.userId}</div>
          </div>
        </main>
      )}
    </Gate>
  );
}
