import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';

// IMPORTANT: For production, do NOT expose your API key directly in client-side code.
// Use a backend proxy to secure your API key.
const GEMINI_API_KEY = typeof __app_id !== 'undefined'
  ? ""
  : process.env.REACT_APP_GEMINI_API_KEY;

function App() {
  const [decklistInput, setDecklistInput] = useState('');
  const [cardData, setCardData] = useState([]);
  const [deckGuide, setDeckGuide] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentQuote, setCurrentQuote] = useState('');
  const [shuffledQuotes, setShuffledQuotes] = useState([]);
  const quoteIndexRef = useRef(0);
  const outputRef = useRef(null); // Ref for scrolling output

  // Array of MTG-related funny/lore quotes
  const allMtgQuotes = [
    "\"It's not just a game, it's Magic!\" - Probably a planeswalker",
    "\"The stack is a lie.\" - A frustrated storm player",
    "\"Dies to removal.\" - Every competitive player's favorite phrase",
    "\"Just one more land...\" - Everyone, every game",
    "\"Tapping lands for mana? That's so last millennium.\" - Urza, probably",
    "\"My deck has no bad matchups, only bad draws.\" - Optimistic player",
    "\"Friendship is magic, but so is Fireball.\" - Chandra Nalaar, maybe",
    "\"It's not a bug, it's a feature.\" - Mark Rosewater",
    "\"The best defense is a good offense... unless you're playing control.\" - Sun Tzu, if he played MTG",
    "\"What's the worst that could happen?\" - Famous last words before a combo goes off",
    "\"Always bolt the bird.\" - A timeless piece of advice",
    "\"No, you don't get priority there.\" - The judge's favorite line",
    "\"Counterspell? I thought we were friends!\" - A blue player's lament",
    "\"Infinite combos are just a matter of perspective.\" - A mad scientist",
    "\"May your draws be ever perfect, and your opponents' mana-screwed.\" - A blessing from a Planeswalker",
    "\"The graveyard is just a second hand.\" - A reanimator player",
    "\"Why play fair when you can play Eldrazi?\" - An Annihilator enthusiast",
    "\"My life total is just a resource.\" - A black mage, probably at 1 life",
    "\"Yes, I'm tapping all my lands for one spell. What of it?\" - A spell-slinging wizard",
    "\"The best way to win is to not lose.\" - A control player's motto",
  ];

  // Function to shuffle an array (Fisher-Yates)
  const shuffleArray = (array) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  // Effect to manage quote cycling during loading
  useEffect(() => {
    let intervalId;
    if (loading) {
      if (shuffledQuotes.length === 0 || quoteIndexRef.current >= shuffledQuotes.length) {
        const newShuffledQuotes = shuffleArray(allMtgQuotes);
        setShuffledQuotes(newShuffledQuotes);
        quoteIndexRef.current = 0;
        setCurrentQuote(newShuffledQuotes[0]);
      } else {
        setCurrentQuote(shuffledQuotes[quoteIndexRef.current]);
      }

      intervalId = setInterval(() => {
        quoteIndexRef.current = (quoteIndexRef.current + 1) % shuffledQuotes.length;
        setCurrentQuote(shuffledQuotes[quoteIndexRef.current]);
      }, 4000);
    } else {
      clearInterval(intervalId);
      setCurrentQuote('');
    }

    return () => clearInterval(intervalId);
  }, [loading, shuffledQuotes]);

  // Scroll to bottom of output when content changes
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [deckGuide, error, loading]);

  // Function to parse the decklist string into an array of { quantity, name, uniqueId } objects
  const parseDecklist = useCallback((decklistString) => {
    const lines = decklistString.trim().split('\n').filter(line => {
      return line.trim() !== '' && /^\d/.test(line.trim());
    });
    const parsed = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/^(\d+)\s+(.*)$/);
      if (match) {
        const quantity = parseInt(match[1], 10);
        const name = match[2].trim();
        parsed.push({ uniqueId: `${name}-${quantity}-${i}-${crypto.randomUUID()}`, quantity, name });
      }
    }
    return parsed;
  }, []);

  // Function to fetch card data from Scryfall API
  const fetchCardData = useCallback(async (parsedDeck) => {
    const SCRYFALL_API_BASE_URL = 'https://api.scryfall.com';
    const fetchedCards = [];
    const errors = [];

    for (const item of parsedDeck) {
      try {
        let cardResponse;
        let response = await fetch(`${SCRYFALL_API_BASE_URL}/cards/named?exact=${encodeURIComponent(item.name)}`);

        if (!response.ok) {
          response = await fetch(`${SCRYFALL_API_BASE_URL}/cards/search?q=${encodeURIComponent(item.name)}`);
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.details || `Scryfall API error for "${item.name}"`);
          }
          const searchData = await response.json();
          if (searchData.data && searchData.data.length > 0) {
            cardResponse = searchData.data[0];
          } else {
            throw new Error(`No cards found matching "${item.name}" after general search.`);
          }
        } else {
          cardResponse = await response.json();
        }
        
        fetchedCards.push({ ...cardResponse, quantity: item.quantity, uniqueDisplayId: item.uniqueId });
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Error fetching card "${item.name}":`, error);
        errors.push(`Could not find card: "${item.name}". Please check the spelling or try an English name.`);
      }
    }

    if (errors.length > 0) {
      throw new Error(errors.join('\n'));
    }
    return fetchedCards;
  }, []);

  // Function to generate the deck guide using Gemini API
  const generateDeckGuide = useCallback(async (cards) => {
    if (!cards || cards.length === 0) {
      throw new Error("No card data provided to generate a deck guide.");
    }

    const decklistFormatted = cards.map(card => {
      const setName = card.set_name ? `(${card.set_name.toUpperCase()})` : '';
      const manaCost = card.mana_cost || 'N/A';
      const typeLine = card.type_line || 'N/A';
      const oracleText = card.oracle_text || 'No Oracle Text';
      return `${card.quantity} ${card.name} ${setName} - Mana: ${manaCost} - Type: ${typeLine}\nOracle Text: ${oracleText}`;
    }).join('\n\n');

    const chatHistory = [];
    const prompt = `
    You are an expert Magic: The Gathering deckbuilder and strategist.
    Based on the following decklist, generate a comprehensive deck guide.
    The guide should be detailed, insightful, and helpful for a player looking to understand and improve their deck.

    The guide must include the following sections, clearly marked with Markdown headings:
    # Deck Archetype and Core Strategy
    * Identify the primary archetype (e.g., Aggro, Control, Midrange, Combo, Tempo, Prison, Voltron, etc.).
    * Explain the deck's main game plan, how it aims to win, and its key phases (early, mid, late game).

    # Key Cards and Synergies
    * Highlight 3-5 of the most crucial cards in the deck.
    * Explain why these cards are important and how they contribute to the deck's strategy.
    * Describe significant card synergies and powerful interactions between cards.

    # Mana Curve Analysis
    * Provide a brief analysis of the deck's mana curve.
    * Comment on whether it supports the deck's strategy (e.g., low curve for aggro, higher curve for control).
    * Suggest any potential improvements or observations regarding mana efficiency.

    # Strengths
    * List the main advantages of this deck. What does it do well?
    * Against what types of decks or strategies does it typically perform strongly?

    # Weaknesses
    * Identify the deck's vulnerabilities and potential pain points.
    * Against what types of decks or strategies does it typically struggle?
    * Suggest common answers or disruption that opponents might use against it.

    # Mulligan Guide
    * Offer general advice on what to look for in an opening hand (e.g., lands, early plays, key pieces).
    * Provide examples of good vs. bad opening hands.

    # General Matchup Considerations
    * Briefly discuss how the deck might approach common matchups (e.g., playing against other aggro decks, control decks, or combo decks).
    * Suggest general sideboarding considerations if applicable (even if no sideboard is provided).

    ---
    **Decklist:**
    ${decklistFormatted}
    ---
    `;

    chatHistory.push({ role: "user", parts: [{ text: prompt }] });
    const payload = { contents: chatHistory };
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();

      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        return result.candidates[0].content.parts[0].text;
      } else {
        console.error("Unexpected Gemini API response structure:", result);
        throw new Error("Gemini API returned an unexpected response.");
      }
    } catch (apiError) {
      console.error("Error calling Gemini API:", apiError);
      throw new Error("Failed to communicate with the AI. Please try again.");
    }
  }, []);

  const handleGenerateGuide = async () => {
    setLoading(true);
    setError(null);
    setDeckGuide(''); // Clear previous guide
    setCardData([]); // Clear previous card data

    try {
      const parsedDeck = parseDecklist(decklistInput);
      if (parsedDeck.length === 0) {
        throw new Error("Please enter a valid decklist. Format: 'Quantity Card Name'.");
      }

      const fetchedCards = await fetchCardData(parsedDeck);
      setCardData(fetchedCards);

      const guide = await generateDeckGuide(fetchedCards);
      setDeckGuide(guide);
      setDecklistInput(''); // Clear input after successful generation

    } catch (err) {
      console.error("Error during guide generation:", err);
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handleNewAnalysis = () => {
    setDecklistInput('');
    setDeckGuide('');
    setCardData([]);
    setError(null);
    setLoading(false);
  };

  return (
    <div style={styles.appContainer}>
      <div style={styles.terminalWindow}>
        <div style={styles.terminalHeader}>
          <span style={styles.terminalDot}></span>
          <span className="terminal-dot-yellow"></span> {/* Use class for yellow dot */}
          <span className="terminal-dot-green"></span> {/* Use class for green dot */}
        </div>
        <div style={styles.terminalBody} ref={outputRef}>
          <p style={styles.terminalLine}>
            <span style={styles.prompt}>user@mtg-strat:~$&nbsp;</span>
            <span style={styles.cursor}></span>
          </p>
          <p style={styles.terminalLine}>Welcome to MTG Deck Strategies Console!</p>
          <p style={styles.terminalLine}>Enter your decklist below and press 'Generate Guide' to get insights.</p>
          <p style={styles.terminalLine}>Format: "Quantity Card Name" (e.g., 4 Lightning Bolt)</p>
          <br />
          <textarea
            style={styles.textarea}
            value={decklistInput}
            onChange={(e) => setDecklistInput(e.target.value)}
            disabled={loading}
            placeholder="Enter decklist here..."
            rows={10}
          />
          <br />
          <button
            style={styles.button}
            onClick={handleGenerateGuide}
            disabled={loading || !decklistInput.trim()}
          >
            {loading ? (
              <>
                Generating
                <span className="loading-dot" style={{ animationDelay: '0s' }}>.</span>
                <span className="loading-dot" style={{ animationDelay: '0.2s' }}>.</span>
                <span className="loading-dot" style={{ animationDelay: '0.4s' }}>.</span>
              </>
            ) : (
              'Generate Guide'
            )}
          </button>

          {loading && (
            <p style={styles.terminalLine}>
              <span style={styles.loadingQuote}>{currentQuote}</span>
            </p>
          )}

          {error && (
            <>
              <p style={styles.terminalLine}>
                <span style={styles.errorText}>Error: {error}</span>
              </p>
              <button style={styles.button} onClick={handleNewAnalysis}>
                Start New Analysis
              </button>
            </>
          )}

          {deckGuide && (
            <>
              <p style={styles.terminalLine}>
                <span style={styles.successText}>Deck Guide Generated:</span>
              </p>
              <div style={styles.deckGuideOutput}>
                <ReactMarkdown
                  components={{
                    h1: ({node, ...props}) => <h2 style={styles.markdownH2} {...props} />,
                    h2: ({node, ...props}) => <h3 style={styles.markdownH3} {...props} />,
                    h3: ({node, ...props}) => <h4 style={styles.markdownH4} {...props} />,
                    p: ({node, ...props}) => <p style={styles.markdownP} {...props} />,
                    ul: ({node, ...props}) => <ul style={styles.markdownUl} {...props} />,
                    ol: ({node, ...props}) => <ol style={styles.markdownOl} {...props} />,
                    li: ({node, ...props}) => <li style={styles.markdownLi} {...props} />,
                    strong: ({node, ...props}) => <strong style={styles.markdownStrong} {...props} />,
                    em: ({node, ...props}) => <em style={styles.markdownEm} {...props} />,
                    a: ({node, ...props}) => <a style={styles.markdownLink} target="_blank" rel="noopener noreferrer" {...props} />,
                    code: ({node, inline, className, children, ...props}) => {
                      return (
                        <code style={styles.markdownCode} {...props}>
                          {children}
                        </code>
                      );
                    }
                  }}
                >
                  {deckGuide}
                </ReactMarkdown>
              </div>
              <br />
              {/* Display card images if available */}
              {cardData.length > 0 && (
                <>
                  <p style={styles.terminalLine}>
                    <span style={styles.successText}>Cards in Deck:</span>
                  </p>
                  <div style={styles.cardGrid}>
                    {cardData.map((card) => (
                      <div key={card.uniqueDisplayId} style={styles.cardItem}>
                        {card.image_uris?.small ? (
                          <img
                            src={card.image_uris.small}
                            alt={card.name}
                            style={styles.cardImage}
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.src = `https://placehold.co/120x168/282c34/61dafb?text=No+Image`; // Placeholder for console theme
                            }}
                          />
                        ) : (
                          <div style={{ ...styles.cardImage, ...styles.cardPlaceholder }}>
                            No Image
                          </div>
                        )}
                        <span style={styles.cardText}>{card.quantity}x {card.name}</span>
                        <span style={styles.cardTextSmall}>Mana: {card.mana_cost || 'N/A'}</span>
                        <span style={styles.cardTextSmall}>Type: {card.type_line || 'N/A'}</span>
                      </div>
                    ))}
                  </div>
                  <br />
                </>
              )}
              <button style={styles.button} onClick={handleNewAnalysis}>
                Start New Analysis
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  appContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start', // Align to top
    minHeight: '100vh',
    backgroundColor: '#282c34', // Dark background for the whole page
    padding: '20px',
    boxSizing: 'border-box',
  },
  terminalWindow: {
    width: '100%',
    maxWidth: '800px', // Max width for desktop
    backgroundColor: '#1a1a1a', // Even darker for terminal window
    borderRadius: '8px',
    boxShadow: '0 0 20px rgba(0, 255, 0, 0.3)', // Green glow
    overflow: 'hidden',
    border: '1px solid #00ff00', // Green border
    display: 'flex',
    flexDirection: 'column',
    minHeight: 'calc(100vh - 40px)', // Fill height minus padding
  },
  terminalHeader: {
    backgroundColor: '#333',
    padding: '8px 15px',
    display: 'flex',
    alignItems: 'center',
    borderBottom: '1px solid #00ff00',
  },
  terminalDot: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    backgroundColor: '#ff5f56', // Red
    marginRight: '8px',
  },
  terminalBody: {
    flexGrow: 1,
    padding: '20px',
    fontFamily: '"Courier New", Courier, monospace',
    fontSize: '1rem',
    color: '#00ff00', // Green text for terminal
    whiteSpace: 'pre-wrap', // Preserve whitespace and wrap text
    wordBreak: 'break-word', // Break long words
    overflowY: 'auto', // Enable scrolling for content overflow
  },
  terminalLine: {
    margin: '0',
    lineHeight: '1.5',
  },
  prompt: {
    color: '#00ff00', // Green for prompt
  },
  cursor: {
    display: 'inline-block',
    width: '8px',
    height: '1em',
    backgroundColor: '#00ff00',
    verticalAlign: 'middle',
    animation: 'blink 1s infinite',
  },
  textarea: {
    width: 'calc(100% - 20px)', // Adjust for padding
    backgroundColor: 'rgba(0, 0, 0, 0.5)', // Slightly transparent black
    border: '1px solid #00ff00',
    color: '#00ff00',
    fontFamily: '"Courier New", Courier, monospace',
    fontSize: '1rem',
    padding: '10px',
    boxSizing: 'border-box',
    resize: 'vertical', // Allow vertical resizing
    marginTop: '10px',
    marginBottom: '10px',
  },
  button: {
    backgroundColor: '#008000', // Darker green for button
    color: '#ffffff',
    border: '1px solid #00ff00',
    padding: '10px 20px',
    fontFamily: '"Courier New", Courier, monospace',
    fontSize: '1rem',
    cursor: 'pointer',
    marginTop: '10px',
    marginBottom: '10px',
    borderRadius: '5px',
    transition: 'background-color 0.3s, box-shadow 0.3s',
    '&:hover': {
      backgroundColor: '#00b300', // Lighter green on hover
      boxShadow: '0 0 10px rgba(0, 255, 0, 0.5)',
    },
    '&:disabled': {
      backgroundColor: '#333',
      color: '#666',
      borderColor: '#333',
      cursor: 'not-allowed',
    },
  },
  loadingText: {
    color: '#ffdd00', // Amber for loading text
  },
  loadingQuote: {
    color: '#ffdd00', // Amber for loading quotes
    fontStyle: 'italic',
  },
  errorText: {
    color: '#ff0000', // Red for errors
    fontWeight: 'bold',
  },
  successText: {
    color: '#00ff00', // Green for success messages
    fontWeight: 'bold',
  },
  deckGuideOutput: {
    marginTop: '20px',
    borderTop: '1px dashed #00ff00', // Dashed green line
    paddingTop: '20px',
    color: '#00ff00', // Ensure guide text is green
  },
  markdownH2: {
    color: '#00ff00', // Green for headings
    fontSize: '1.4rem',
    marginTop: '1.5rem',
    marginBottom: '0.8rem',
    borderBottom: '1px solid #00ff00',
    paddingBottom: '0.5rem',
  },
  markdownH3: {
    color: '#00ff00', // Green for subheadings
    fontSize: '1.2rem',
    marginTop: '1.2rem',
    marginBottom: '0.6rem',
  },
  markdownH4: {
    color: '#00ff00', // Green for sub-subheadings
    fontSize: '1.1rem',
    marginTop: '1rem',
    marginBottom: '0.5rem',
  },
  markdownP: {
    color: '#00ff00', // Green for paragraphs
    marginBottom: '1rem',
  },
  markdownUl: {
    listStyleType: 'disc',
    marginLeft: '20px',
    marginBottom: '1rem',
  },
  markdownOl: {
    listStyleType: 'decimal',
    marginLeft: '20px',
    marginBottom: '1rem',
  },
  markdownLi: {
    color: '#00ff00', // Green for list items
    marginBottom: '0.4rem',
  },
  markdownStrong: {
    color: '#ffdd00', // Amber for strong text
    fontWeight: 'bold',
  },
  markdownEm: {
    color: '#ffdd00', // Amber for emphasized text
    fontStyle: 'italic',
  },
  markdownLink: {
    color: '#61dafb', // Blue for links, like a typical terminal link
    textDecoration: 'underline',
  },
  markdownCode: {
    backgroundColor: 'rgba(0, 255, 0, 0.1)', // Light green background for inline code
    color: '#00ff00', // Green text for code
    padding: '2px 4px',
    borderRadius: '3px',
  },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', // Responsive grid
    gap: '15px',
    marginTop: '20px',
    justifyItems: 'center',
  },
  cardItem: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)', // Slightly transparent darker background for cards
    border: '1px solid #00ff00',
    borderRadius: '5px',
    padding: '10px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    color: '#00ff00',
  },
  cardImage: {
    width: '100%',
    maxWidth: '120px',
    height: 'auto',
    borderRadius: '3px',
    marginBottom: '8px',
    border: '1px solid #00ff00',
  },
  cardPlaceholder: {
    width: '120px',
    height: '168px', // Standard card aspect ratio
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 255, 0, 0.1)',
    color: '#00ff00',
    fontSize: '0.8rem',
    marginBottom: '8px',
    borderRadius: '3px',
    border: '1px dashed #00ff00',
  },
  cardText: {
    fontSize: '0.9rem',
    fontWeight: 'bold',
    marginBottom: '4px',
  },
  cardTextSmall: {
    fontSize: '0.8rem',
    color: '#00cc00', // Slightly darker green for secondary info
  },
};

// Inject keyframes and pseudo-class styles into a style tag
const styleSheet = document.createElement("style");
styleSheet.type = "text/css";
styleSheet.innerText = `
  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }
  @keyframes dot-fade {
    0%, 100% { opacity: 0; }
    50% { opacity: 1; }
  }
  .terminal-dot-yellow {
    background-color: #ffbd2e; /* Yellow */
  }
  .terminal-dot-green {
    background-color: #27c93f; /* Green */
  }
  .loading-dot {
    animation: dot-fade 1.5s infinite;
    display: inline-block; /* Ensure dots are on the same line */
    margin-left: 2px; /* Small spacing between dots */
    color: #ffdd00; /* Amber color for dots */
  }
`;
document.head.appendChild(styleSheet);


export default App;