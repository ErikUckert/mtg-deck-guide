import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown'; // For rendering Markdown from Gemini API

// Material UI Imports
import {
  Container,
  TextField,
  Button,
  CircularProgress,
  Typography,
  Box,
  Paper,
  Grid,
  Alert,
  Snackbar,
  Backdrop, // Import Backdrop for the overlay
} from '@mui/material';
import { createTheme, ThemeProvider, useTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline'; // For consistent baseline styles

// IMPORTANT: For production, do NOT expose your API key directly in client-side code.
// Use a backend proxy to secure your API key.
// Conditional logic for GEMINI_API_KEY to work in both Canvas and local development.
const GEMINI_API_KEY = typeof __app_id !== 'undefined'
  ? "" // In Canvas environment, the key is injected automatically when this is an empty string
  : process.env.REACT_APP_GEMINI_API_KEY; // In local development, read from .env file

// Define a custom Material UI theme using the provided palette
const lightTheme = createTheme({
  palette: {
    mode: 'light', // Set mode to light for appropriate Material Design defaults
    // Custom Palette based on user's input
    primary: {
      main: '#6D696A', // Dark grey for primary actions/elements
      light: '#A2A7A5', // Medium grey for lighter primary accents
      dark: '#4D494A',  // Even darker grey for primary dark shades
      contrastText: '#FFFFFF', // White text on dark primary buttons
    },
    secondary: {
      main: '#A2A7A5', // Medium grey for secondary actions/elements
      light: '#DAE2DF', // Light grey for secondary accents
      dark: '#6D696A',  // Dark grey for secondary dark shades
      contrastText: '#FFFFFF',
    },
    background: {
      default: '#E2DADB', // Lightest grey/off-white for main background
      paper: '#DAE2DF',   // Slightly darker light grey for cards/surfaces
    },
    text: {
      primary: '#6D696A', // Dark grey for main text on light backgrounds
      secondary: '#A2A7A5', // Medium grey for secondary text
    },
    error: {
      main: '#F2B8B5', // Error 80 (kept from M3 baseline for clear error indication)
      contrastText: '#410002',
    },
    // Adding M3 specific colors for better adherence (adjusted for light theme)
    surface: '#DAE2DF', // Matches background.paper
    onSurface: '#6D696A', // Matches text.primary
    surfaceVariant: '#A2A7A5', // Medium grey
    onSurfaceVariant: '#6D696A', // Dark grey
    outline: '#A2A7A5', // Medium grey for borders
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif', // MUI's default Roboto
    h4: {
      fontWeight: 700,
      color: '#6D696A', // Primary text color for headings
    },
    h5: {
      fontWeight: 600,
      color: '#6D696A', // Primary text color for headings
    },
    h6: {
      fontWeight: 500,
      color: '#6D696A', // Primary text color for headings
    },
    subtitle1: {
      color: '#A2A7A5', // Secondary text color
    },
    body1: {
      lineHeight: 1.7,
      color: '#6D696A', // Primary text color
    },
    body2: {
      lineHeight: 1.6,
      color: '#A2A7A5', // Secondary text color
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: 10,
          textTransform: 'none',
          fontWeight: 600,
          padding: '12px 24px',
          boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.15)', // Lighter shadow for light theme
          '&:hover': {
            boxShadow: '0px 6px 14px rgba(0, 0, 0, 0.25)',
            backgroundColor: theme.palette.primary.light, // Lighter on hover
          },
          color: theme.palette.primary.contrastText, // White text on primary button
          backgroundColor: theme.palette.primary.main,
        }),
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: ({ theme }) => ({
          '& .MuiOutlinedInput-root': {
            borderRadius: 10,
            backgroundColor: 'rgba(255, 255, 255, 0.8)', // Almost opaque white for input field
            '&.Mui-focused': {
              backgroundColor: 'rgba(255, 255, 255, 0.9)', // Slightly more opaque when focused
            },
          },
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: `${theme.palette.outline} !important`, // Always visible border using M3 Outline color
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: `${theme.palette.primary.main} !important`, // Primary color on hover
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: `${theme.palette.primary.main} !important`, // Primary color when focused
            borderWidth: '2px !important', // Thicker border when focused
          },
        }),
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: 16,
          boxShadow: '0px 10px 25px rgba(0, 0, 0, 0.2)', // Lighter shadow for light theme
          // Apply light grey with glass effect, adjusted for new palette
          backgroundColor: 'rgba(218, 226, 223, 0.7)', // background.paper with 70% opacity for glass
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border: `1px solid ${theme.palette.outline}`, // Use M3 Outline color for card borders
        }),
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: 8,
          backgroundColor: theme.palette.error.main,
          color: theme.palette.error.contrastText,
          fontWeight: 500,
        }),
      },
    },
    MuiCircularProgress: {
      styleOverrides: {
        root: ({ theme }) => ({
          color: theme.palette.primary.main,
        }),
      },
    },
  },
});

function App() {
  const theme = useTheme(); // Use the useTheme hook to access the theme object

  const [decklistInput, setDecklistInput] = useState('');
  const [cardData, setCardData] = useState([]);
  const [deckGuide, setDeckGuide] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [snackbarOpen, setSnackbarOpen] = useState(false); // State for Snackbar
  const [currentQuote, setCurrentQuote] = useState(''); // State for current displayed quote
  const [shuffledQuotes, setShuffledQuotes] = useState([]); // State for shuffled quotes
  const quoteIndexRef = useRef(0); // Use ref to persist index across renders without re-triggering effects

  // Array of MTG-related funny/lore quotes (expanded to 20)
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
      // Initialize or re-shuffle quotes if all have been shown
      if (shuffledQuotes.length === 0 || quoteIndexRef.current >= shuffledQuotes.length) {
        const newShuffledQuotes = shuffleArray(allMtgQuotes);
        setShuffledQuotes(newShuffledQuotes);
        quoteIndexRef.current = 0; // Reset index
        setCurrentQuote(newShuffledQuotes[0]); // Set initial quote immediately
      } else {
        // If not a fresh start, just set the current quote from the existing shuffled list
        setCurrentQuote(shuffledQuotes[quoteIndexRef.current]);
      }

      intervalId = setInterval(() => {
        quoteIndexRef.current = (quoteIndexRef.current + 1) % shuffledQuotes.length;
        setCurrentQuote(shuffledQuotes[quoteIndexRef.current]);
      }, 4000); // Change quote every 4 seconds
    } else {
      clearInterval(intervalId); // Clear interval when not loading
      setCurrentQuote(''); // Clear quote when loading finishes
    }

    return () => clearInterval(intervalId); // Cleanup on component unmount or loading change
  }, [loading, shuffledQuotes]); // Depend on loading and shuffledQuotes

  // Function to parse the decklist string into an array of { quantity, name, uniqueId } objects
  const parseDecklist = useCallback((decklistString) => {
    const lines = decklistString.trim().split('\n').filter(line => {
      // Filter out empty lines and lines that do not start with a digit
      // This prevents warnings for section headers like "Creatures", "Lands", etc.
      return line.trim() !== '' && /^\d/.test(line.trim());
    });
    const parsed = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/^(\d+)\s+(.*)$/); // Expects "QUANTITY CARD_NAME"
      if (match) {
        const quantity = parseInt(match[1], 10);
        const name = match[2].trim();
        parsed.push({ uniqueId: `${name}-${quantity}-${i}-${crypto.randomUUID()}`, quantity, name });
      }
      // No 'else' block with console.warn, as these lines are now filtered out
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
        // First, try an exact search for the card name
        let response = await fetch(`${SCRYFALL_API_BASE_URL}/cards/named?exact=${encodeURIComponent(item.name)}`);

        if (!response.ok) {
          // If exact search fails (e.g., 404 Not Found), try a more general search
          // This helps with non-English names or slight variations
          response = await fetch(`${SCRYFALL_API_BASE_URL}/cards/search?q=${encodeURIComponent(item.name)}`);
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.details || `Scryfall API error for "${item.name}"`);
          }
          const searchData = await response.json();
          if (searchData.data && searchData.data.length > 0) {
            // Take the first result from the search
            cardResponse = searchData.data[0];
          } else {
            throw new Error(`No cards found matching "${item.name}" after general search.`);
          }
        } else {
          cardResponse = await response.json();
        }
        
        // Attach the original quantity and uniqueId to the fetched card data
        fetchedCards.push({ ...cardResponse, quantity: item.quantity, uniqueDisplayId: item.uniqueId });
        // Small delay to prevent hitting rate limits too quickly
        await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay
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

    // Format the card data into a readable string for the LLM
    const decklistFormatted = cards.map(card => {
      // Safely access properties, provide fallbacks
      const setName = card.set_name ? `(${card.set_name.toUpperCase()})` : '';
      const manaCost = card.mana_cost || 'N/A';
      const typeLine = card.type_line || 'N/A';
      const oracleText = card.oracle_text || 'No Oracle Text';
      return `${card.quantity} ${card.name} ${setName} - Mana: ${manaCost} - Type: ${typeLine}\nOracle Text: ${oracleText}`;
    }).join('\n\n'); // Use double newline for better readability in prompt

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

  // Handler for the "Generate Deck Guide" button click
  const handleGenerateGuide = async () => {
    setLoading(true);
    setError(null);
    setSnackbarOpen(false); // Close any existing snackbar
    setCardData([]);
    setDeckGuide('');
    // Start quote cycling immediately when loading begins
    // The useEffect hook will handle setting the initial quote and subsequent cycling

    try {
      const parsedDeck = parseDecklist(decklistInput);
      if (parsedDeck.length === 0) {
        throw new Error("Please enter a valid decklist. Format: 'Quantity Card Name'.");
      }

      const fetchedCards = await fetchCardData(parsedDeck);
      setCardData(fetchedCards);

      const guide = await generateDeckGuide(fetchedCards);
      setDeckGuide(guide);

    } catch (err) {
      console.error("Error during guide generation:", err);
      setError(err.message || "An unexpected error occurred.");
      setSnackbarOpen(true); // Show Snackbar for error
    } finally {
      setLoading(false);
    }
  };

  const handleSnackbarClose = (event, reason) => {
    if (reason === 'clickaway') {
      return;
    }
    setSnackbarOpen(false);
  };

  return (
    <ThemeProvider theme={lightTheme}>
      <CssBaseline />
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Box sx={{ textAlign: 'center', mb: 6 }}>
          <Typography variant="h4" component="h1" gutterBottom>
            MTG Deck Strategies
          </Typography>
          <Typography variant="subtitle1" color="text.secondary">
            Analyze your Magic: The Gathering deck with AI-powered insights.
          </Typography>
        </Box>

        {/* Deck Input Section */}
        <Paper elevation={6} sx={{ p: { xs: 3, sm: 4 }, mb: 4 }}>
          <Typography variant="h6" gutterBottom color="text.primary">
            Enter Your Decklist
          </Typography>
          <TextField
            id="decklist"
            label="Decklist"
            multiline
            rows={10}
            fullWidth
            variant="outlined"
            placeholder="Example:
4 Lightning Bolt
4 Goblin Guide
18 Mountain
1 Sol Ring (Commander)"
            value={decklistInput}
            onChange={(e) => setDecklistInput(e.target.value)}
            disabled={loading}
            sx={{
              mb: 3,
              '& .MuiInputBase-input': {
                color: theme.palette.text.primary,
              },
              '& .MuiInputLabel-root': {
                color: theme.palette.text.secondary,
              },
              '& .MuiOutlinedInput-root': {
                backgroundColor: 'rgba(255, 255, 255, 0.8)',
                '&.Mui-focused': {
                  backgroundColor: 'rgba(255, 255, 255, 0.9)',
                },
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: `${theme.palette.outline} !important`,
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: `${theme.palette.primary.main} !important`,
                },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: `${theme.palette.primary.main} !important`,
                },
              },
            }}
          />
          <Button
            variant="contained"
            color="primary"
            fullWidth
            size="large"
            onClick={handleGenerateGuide}
            disabled={loading || !decklistInput.trim()}
            startIcon={loading ? <CircularProgress size={20} color="inherit" /> : null}
          >
            {loading ? 'Generating...' : 'Generate Deck Guide'}
          </Button>
        </Paper>

        {/* Loading Overlay */}
        <Backdrop
          sx={{
            color: '#fff',
            zIndex: (theme) => theme.zIndex.drawer + 1,
            backgroundColor: 'rgba(0, 0, 0, 0.7)', // Darker, more prominent overlay
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            p: 3, // Add some padding
          }}
          open={loading}
        >
          <CircularProgress color="inherit" size={60} sx={{ mb: 3 }} />
          <Typography variant="h5" component="p" color="white" sx={{ mb: 2, fontWeight: 'bold' }}>
            Summoning Insights...
          </Typography>
          {currentQuote && (
            <Typography variant="h6" component="p" color="white" sx={{ maxWidth: '80%', fontStyle: 'italic' }}>
              {currentQuote}
            </Typography>
          )}
        </Backdrop>

        {/* Error Snackbar */}
        <Snackbar
          open={snackbarOpen}
          autoHideDuration={6000}
          onClose={handleSnackbarClose}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert onClose={handleSnackbarClose} severity="error" sx={{ width: '100%' }}>
            {error}
          </Alert>
        </Snackbar>

        {/* Deck Guide Display Section */}
        {deckGuide && (
          <Paper elevation={6} sx={{ p: { xs: 3, sm: 4 }, mt: 4 }}>
            <Typography variant="h5" component="h2" sx={{ mb: 3, textAlign: 'center' }}>
              Deck Guide Analysis
            </Typography>
            <Box sx={{ typography: 'body1', lineHeight: 1.7, color: 'text.primary' }}>
              <ReactMarkdown
                components={{
                  h1: ({node, ...props}) => <Typography variant="h5" sx={{ mt: 4, mb: 2, borderBottom: '1px solid', borderColor: 'divider', pb: 1, color: theme.palette.text.primary }} {...props} />,
                  h2: ({node, ...props}) => <Typography variant="h6" sx={{ mt: 3, mb: 1.5, color: theme.palette.text.primary }} {...props} />,
                  h3: ({node, ...props}) => <Typography variant="subtitle1" sx={{ mt: 2, mb: 1, fontWeight: 'bold', color: theme.palette.text.primary }} {...props} />,
                  p: ({node, ...props}) => <Typography variant="body1" sx={{ mb: 2, color: theme.palette.text.primary }} {...props} />,
                  ul: ({node, ...props}) => <Box component="ul" sx={{ pl: 3, mb: 2, '& li': { mb: 0.5, color: theme.palette.text.primary } }} {...props} />,
                  ol: ({node, ...props}) => <Box component="ol" sx={{ pl: 3, mb: 2, '& li': { mb: 0.5, color: theme.palette.text.primary } }} {...props} />,
                  li: ({node, ...props}) => <Typography variant="body2" component="li" {...props} />,
                  strong: ({node, ...props}) => <Box component="strong" sx={{ color: theme.palette.text.primary }} {...props} />,
                  em: ({node, ...props}) => <Box component="em" sx={{ fontStyle: 'italic', color: theme.palette.text.secondary }} {...props} />,
                  a: ({node, ...props}) => <a style={{ color: theme.palette.primary.main, textDecoration: 'underline' }} target="_blank" rel="noopener noreferrer" {...props} />, // Using primary for links
                  code: ({node, inline, className, children, ...props}) => {
                    return (
                      <Box component="code" sx={{
                        backgroundColor: 'rgba(0, 0, 0, 0.05)', // Subtle dark background for code on light theme
                        color: theme.palette.primary.main, // Primary color for code text
                        px: 0.5,
                        py: 0.2,
                        borderRadius: 1,
                        fontSize: '0.85em',
                      }} {...props}>
                        {children}
                      </Box>
                    );
                  }
                }}
              >
                {deckGuide}
              </ReactMarkdown>
            </Box>

            {/* Cards in Deck Display */}
            {cardData.length > 0 && (
              <Box sx={{ mt: 6 }}>
                <Typography variant="h5" component="h3" sx={{ mb: 3, textAlign: 'center' }}>
                  Cards in Deck
                </Typography>
                <Grid container spacing={2} justifyContent="center">
                  {cardData.map((card) => (
                    <Grid item xs={12} sm={6} md={4} key={card.uniqueDisplayId}>
                      <Paper elevation={3} sx={{ p: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
                        {card.image_uris?.small ? (
                          <Box
                            component="img"
                            src={card.image_uris.small}
                            alt={card.name}
                            sx={{
                              width: '100%',
                              maxWidth: 120,
                              height: 'auto',
                              borderRadius: 1,
                              mb: 1.5,
                              objectFit: 'contain',
                            }}
                            onError={(e) => {
                              e.target.onerror = null;
                              // Safely get hex values for placeholder image using theme palette
                              const bgColor = theme.palette.background.paper.replace('#', '');
                              const textColor = theme.palette.text.secondary.replace('#', '');
                              e.target.src = `https://placehold.co/120x168/${bgColor}/${textColor}?text=No+Image`;
                            }}
                          />
                        ) : (
                          <Box
                            sx={{
                              width: '100%',
                              maxWidth: 120,
                              height: 168, // Standard card aspect ratio
                              backgroundColor: theme.palette.background.paper, // Use paper background for placeholder
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: theme.palette.text.secondary,
                              fontSize: '0.75rem',
                              textAlign: 'center',
                              borderRadius: 1,
                              mb: 1.5,
                            }}
                          >
                            No Image Available
                          </Box>
                        )}
                        <Typography variant="subtitle1" sx={{ fontWeight: 'bold', textAlign: 'center' }}>
                          {card.quantity}x {card.name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Mana: {card.mana_cost || 'N/A'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Type: {card.type_line || 'N/A'}
                        </Typography>
                      </Paper>
                    </Grid>
                  ))}
                </Grid>
              </Box>
            )}
          </Paper>
        )}
      </Container>
    </ThemeProvider>
  );
}

export default App;
