import Link from "next/link";
export default function InvalidReviewLink(){
 return <main className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-5">
  <section className="max-w-lg space-y-3 text-center">
   <h1 className="text-2xl font-semibold">Review card link required</h1>
   <p className="text-neutral-400">Scan the QR code from a business's DigiMarket review card to open its unique review page.</p>
   <Link href="/" className="underline">Return to DigiMarket</Link>
  </section>
 </main>;
}
