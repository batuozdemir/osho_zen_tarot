
  
  // Function to get card names from card numbers
  function getCardName(cardNumber) {
    const cardNames = [
      "The Fool",
      "Existence",
      "Inner Voice",
      "Creativity",
      "The Rebel",
      "Change",
      "Awareness",
      "Conditioning",
      "Courage",
      "The Creator",
      "Enlightenment",
      "New Vision",
      "Transformation",
      "Integration",
      "Conditioning",
      "Thunderbolt",
      "Silence",
      "Past Lives",
      "Innocence",
      "Beyond Illusion",
      "Totality",
      "Celebration",
      "The Source",
      "Turning In",
      "Healing",
      "Completion",
      "Harmony",
      "Stress",
      "Sorrow",
      "Playfulness",
      "Moment to Moment",
      "Comparison",
      "Exhaustion",
      "Guilt",
      "Clinging to the Past",
      "Morality",
      "The Burden",
      "Consciousness",
      "The Miser",
      "Postponement",
      "Fighting",
      "The Rebel",
      "Aloneness",
      "Adventure",
      "Maturity",
      "The Dream",
      "Ordinariness",
      "Mind",
      "Patience",
      "Ripeness",
      "Turning In",
      "Sorrow",
      "Expansion",
      "Success",
      "The Outsider",
      "Traveling",
      "Guidance",
      "Receptivity",
      "Slowing Down",
      "Flowering",
      "Friendliness",
      "The Creator",
      "Trust",
      "Openness",
      "Letting Go",
      "Politics",
      "Courage",
      "Breakthrough",
      "Totality",
      "Maturity",
      "Innocence",
      "Understanding",
      "The Rebel",
      "Exhaustion",
      "Silence",
      "Morality",
      "Thunderbolt",
      "Consciousness",
      "We are the World",
      "Celebration",
      "Existence"
    ];
    return cardNames[cardNumber - 1];
  }
  
  // Variables to store the drawn card and previously drawn cards
  let drawnCard = null;
  let previousCards = [];
  
  // Function to draw a random card
  function drawRandomCard() {
    const availableCards = Array.from({ length: 79 }, (_, i) => i + 1).filter(card => !previousCards.includes(card));
    if (availableCards.length > 0) {
      const cardNumber = availableCards[Math.floor(Math.random() * availableCards.length)];
      drawnCard = cardNumber;
      previousCards.push(cardNumber);
      return cardNumber;
    }
    return null;
  }
  
  // Function to update the previously drawn cards UI
  function updatePreviousCardsUI() {
    const previousCardsUI = document.getElementById("previousCardsUI");
    previousCardsUI.innerHTML = "";
    if (previousCards.length > 0) {
      const cardChoices = previousCards.map((cardNumber, index) => `<div><input type="radio" name="previousCards" value="${cardNumber}" id="card${cardNumber}"><label for="card${cardNumber}">${index + 1}- ${getCardName(cardNumber)}</label></div>`);
      previousCardsUI.innerHTML = `
        <div style="height: 200px; overflow-y: auto;">
          ${cardChoices.join("")}
        </div>
        <button id="refreshCards">Refresh</button>
      `;
      document.getElementById("refreshCards").addEventListener("click", refreshCards);
      document.querySelectorAll('input[name="previousCards"]').forEach(radio => {
        radio.addEventListener("change", selectPreviousCard);
      });
    } else {
      previousCardsUI.innerHTML = `
        <p>No previously drawn cards.</p>
        <button id="refreshCards">Refresh</button>
      `;
      document.getElementById("refreshCards").addEventListener("click", refreshCards);
    }
  }
  
  // Function to refresh the previously drawn cards
  function refreshCards() {
    previousCards = [];
    updatePreviousCardsUI();
  }
  
  // Function to handle selecting a previously drawn card
  function selectPreviousCard(event) {
    const selectedCardNumber = parseInt(event.target.value);
    drawnCard = selectedCardNumber;
    updateCardUI();
  }
  
  // Function to update the card UI
  function updateCardUI() {
    const cardImage = document.getElementById("cardImage");
    const cardText = document.getElementById("cardText");
    const cardCommentary = document.getElementById("cardCommentary");
    if (drawnCard) {
      cardImage.src = `CardPictures/card_${drawnCard}.jpg`;
      cardImage.alt = `Card ${drawnCard}`;
      
      // Retrieve card text and commentary from files or API
      fetch(`CardText/${drawnCard}_ENG.txt`)
        .then(response => response.text())
        .then(text => {
          cardText.textContent = text;
        })
        .catch(error => {
          console.error("Error fetching card text:", error);
          cardText.textContent = "Card text not available.";
        });
      
      fetch(`CardCommentary/${drawnCard}_ENG_c.txt`)
        .then(response => response.text())
        .then(text => {
          cardCommentary.textContent = text;
        })
        .catch(error => {
          console.error("Error fetching card commentary:", error);
          cardCommentary.textContent = "Card commentary not available.";
        });
    } else {
      cardImage.src = "";
      cardImage.alt = "";
      cardText.textContent = "";
      cardCommentary.textContent = "";
    }
  }
  
  // Function to update the layout UI
  function updateLayoutUI() {
    const layoutSelectUI = document.getElementById("layoutSelectUI");
    const layoutTable = getLayoutTable();
    const layoutOptions = layoutTable.map(layout => `<div><input type="radio" name="layoutSelect" value="${layout.Number}" id="layout${layout.Number}"><label for="layout${layout.Number}">${layout.Name}</label></div>`);
    layoutSelectUI.innerHTML = layoutOptions.join("");
    document.querySelectorAll('input[name="layoutSelect"]').forEach(radio => {
      radio.addEventListener("change", selectLayout);
    });
  }
  
  // Function to handle selecting a layout
  function selectLayout(event) {
    const selectedLayoutNumber = parseInt(event.target.value);
    const layoutImage = document.getElementById("layoutImage");
    const layoutText = document.getElementById("layoutText");
    layoutImage.src = `ReadingLayouts/layout_${selectedLayoutNumber}.jpg`;
    layoutImage.alt = `Layout ${selectedLayoutNumber}`;
    
    // Retrieve layout text from files or API
    fetch(`LayoutText/Layout_ENG_${selectedLayoutNumber}.txt`)
      .then(response => response.text())
      .then(text => {
        layoutText.textContent = text;
      })
      .catch(error => {
        console.error("Error fetching layout text:", error);
        layoutText.textContent = "Layout text not available.";
      });
  }
  
  // Function to handle tab switching
  function switchTab(event) {
    const selectedTab = event.target.getAttribute("data-tab");
    const tabContents = document.querySelectorAll(".tab-content");
    tabContents.forEach(tabContent => {
      tabContent.style.display = tabContent.id === selectedTab ? "block" : "none";
    });
  }
  
  // Event listener for the "Draw a Card" button
  document.getElementById("drawCard").addEventListener("click", () => {
    const newCard = drawRandomCard();
    updateCardUI();
    updatePreviousCardsUI();
  });
  
  // Event listeners for tab switching
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", switchTab);
  });
  
  // Initialize the app
  function initializeApp() {
    updateLayoutUI();
    drawRandomCard();
    updateCardUI();
    updatePreviousCardsUI();
  }
  
  initializeApp();