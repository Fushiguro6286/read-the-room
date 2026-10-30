// Demo definitions (our own text, no Qloo data), safe to import in the browser.
export interface Demo {
  slug: string;
  title: string;
  kind: string;
  text: string;
  roomA: string;
  roomB: string;
}

export const DEMOS: Demo[] = [
  {
    slug: "standup",
    title: "The nephew bit",
    kind: "Stand-up",
    roomA: "Atlanta, ages 45–60",
    roomB: "Brooklyn, ages 25–34",
    text: `My nephew tried to explain his job to me. He's a "content creator." I said, so you're like Oprah? He said no, more like MrBeast. I said who's that? He said, he gives away money on YouTube. I said, so... like The Price Is Right? Anyway, he makes more than me now, and I still keep a Blockbuster card in my wallet. Just in case.`,
  },
  {
    slug: "toast",
    title: "Priya & Sam",
    kind: "Wedding toast",
    roomA: "Chicago, ages 55 and over",
    roomB: "Los Angeles, ages 25–34",
    text: `When Priya first met Sam, she said he had the energy of a golden retriever and the playlist of a broken Spotify Wrapped: Drake, Taylor Swift and the Bridgerton soundtrack on repeat. But she saw past it, the way you forgive the last season of Game of Thrones because the early seasons were so good.`,
  },
  {
    slug: "ad",
    title: "Meet Brewly",
    kind: "Ad copy",
    roomA: "Austin, ages 25–34",
    roomB: "Phoenix, ages 55 and over",
    text: `Meet Brewly, the coffee maker that's as reliable as a Toyota Camry and as smart as an iPhone. Mornings with Brewly feel like the opening of a Friends episode: warm, familiar, and nobody's in a hurry. Pair it with your favorite Starbucks beans.`,
  },
  {
    slug: "pitch",
    title: "Supply-chain pitch",
    kind: "Sales pitch",
    roomA: "Miami, ages 35–50",
    roomB: "Seattle, ages 25–34",
    text: `Think of our platform as the Netflix of supply-chain data: everything in one place, and it knows what you need before you do. Onboarding is faster than a Formula 1 pit stop, and our support team has the patience of Mister Rogers.`,
  },
  {
    slug: "global",
    title: "Route 66",
    kind: "Travel ad",
    roomA: "London, ages 25–34",
    roomB: "New York, ages 25–34",
    text: `This summer, take the road trip your parents always talked about: Route 66 in a Ford Mustang, Bruce Springsteen on the radio, and a Taco Bell stop at midnight.`,
  },
];
