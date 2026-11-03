import Link from "next/link";
export default function PoliciesPage(){return <main className="min-h-screen bg-[#0a0a0f] text-gray-300 px-4 py-8"><div className="mx-auto max-w-2xl space-y-8"><Link href="/" className="inline-flex min-h-11 items-center underline text-indigo-300">Back to KMegle</Link><h1 className="text-3xl font-bold text-white">Terms &amp; Privacy</h1><section><h2 className="text-xl font-semibold text-white mb-4">Terms of Service</h2><div className="text-sm leading-relaxed">                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold text-base mb-1">1. Age Requirement</h4>
                      <p>
                        You must be at least 18 years old (or the legal age of majority in your jurisdiction) to use KMegle video chat. Minors under 18 are strictly prohibited from using the platform.
                      </p>
                    </div>

                    <div>
                      <h4 className="font-semibold text-base mb-1">2. Peer-to-Peer (P2P) WebRTC Architecture</h4>
                      <p>
                        KMegle connects users via WebRTC, directly when possible or through a TURN relay when needed. Direct connections use Peer-to-Peer protocols for real-time video and audio communication. By using KMegle, you understand and acknowledge that P2P technology inherently exchanges network connection details (including public IP addresses) directly between video chat peers.
                      </p>
                    </div>

                    <div>
                      <h4 className="font-semibold text-base mb-1">3. User Conduct & Moderation</h4>
                      <p>
                        You agree to follow all local, state, and international laws. KMegle reserves the right to terminate access, suspend accounts, or permanently block Firebase UIDs and IP addresses without prior notice for any violation of these terms.
                      </p>
                    </div>

                    <div>
                      <h4 className="font-semibold text-base mb-1">4. Recording Disclaimer</h4>
                      <p>
                        While KMegle does not record or store any video or audio streams, we cannot prevent third-party peers from using external screen recording software. Never share personally identifiable information (PII), financial details, or passwords during video chats.
                      </p>
                    </div>
                  </div></div></section><section><h2 className="text-xl font-semibold text-white mb-4">Before you connect</h2><div className="space-y-4 text-sm leading-relaxed text-gray-300">
<p>KMegle uses Google sign-in through Firebase Authentication. The service receives your account ID and email. Its database stores your account ID and a keyed hash of your email; service logs may include your email and account ID.</p>
<p>Video and audio use WebRTC. Connections may be direct or use a TURN relay when needed. A direct connection can reveal your public IP address to the other participant. KMegle&apos;s reviewed application code does not record video or audio, but another participant can record their screen.</p>
<p>For safety, KMegle stores reports, report reasons, blocks and violation records linked to account IDs. Automated content checks run in the browser during a session.</p>
<p>Retention periods and the policies of hosting, authentication and relay providers still need to be confirmed. Do not share passwords, financial details or other private information in a chat.</p>
</div></section><p className="text-sm">Support: <a className="underline text-indigo-300 break-all" href="mailto:aadinadhan17@gmail.com">aadinadhan17@gmail.com</a></p></div></main>}
