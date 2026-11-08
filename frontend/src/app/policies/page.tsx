import Link from "next/link";
import "../chat/components/chat/call.css";
export const metadata = {
  title: "Community & privacy | KMegle",
  alternates: { canonical: "/policies" },
};
export default function PoliciesPage() {
  return (
    <main className="call-app consent-page">
      <article className="account-card">
        <Link href="/">← Home</Link>
        <h1>Community & privacy</h1>
        <p>
          Version 2026-11-08 · For adults studying at IIIT Kottayam. Verified
          Google sign-in is required. Gmail access may be enabled temporarily
          for testing. Explicitly configured test accounts may be used for
          development and staging.
        </p>
        <h2>Look after each other.</h2>
        <p>
          Be respectful. Do not share sexual content, harass, threaten,
          discriminate, spam or expose personal information. You must be at
          least 18. You can leave immediately, report a concern or block future
          matches. Administrators can review reports and suspend accounts.
          Reports and automated flags are allegations, not proof.
        </p>
        <h2>What you share</h2>
        <p>
          Camera check captures on your device. Finding a student starts
          matching and can transmit live audio/video when connected. Muting or
          turning the camera off disables that track. End turns off camera and
          microphone capture.
        </p>
        <p>
          WebRTC attempts a direct connection and uses a TURN relay when needed.
          Direct connections can reveal network details, including public IP
          addresses, to the other participant. The application does not record
          video or audio. Another participant can record their screen.
        </p>
        <h2>Account and safety data</h2>
        <p>
          Google sign-in uses Firebase Authentication. The service receives your
          account ID and email. The database stores your account ID and a keyed
          hash of your email, sign-in times, access status, versioned agreement,
          blocks, reports and report reasons. Admin actions are logged. Reports
          do not include a video recording.
        </p>
        <p>
          Text uses the peer data channel. This application does not persist
          chat text on its server. Keep passwords, financial information and
          personal details out of messages and reports. Automated video checks
          run locally when available, can make mistakes and may fail to load.
          They are not human monitoring or a guarantee of safety.
        </p>
        <h2>Service providers and retention</h2>
        <p>
          The hosting, authentication and relay providers handle data needed to
          operate the service. Retention periods and provider-specific practices
          still require confirmation. Infrastructure logs may include network
          metadata. Optional staging connection snapshots contain connection
          types and metrics; they exclude IP addresses, SDP, credentials and
          identities.
        </p>
        <h2>Questions or account concerns</h2>
        <p>
          Contact{" "}
          <a href="mailto:aadinadhan17@gmail.com">aadinadhan17@gmail.com</a> for
          support, to dispute an account action, or to ask about your data.
        </p>
      </article>
    </main>
  );
}
