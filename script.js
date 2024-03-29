//Script.js

const drawButton = document.getElementById('drawButton');
const cardSelect = document.getElementById('cardSelect');
const cardContainer = document.getElementById('cardContainer');
const cardImage = document.getElementById('cardImage');
const cardText = document.getElementById('cardText');
const cardCommentary = document.getElementById('cardCommentary');
const totalCards = 79;
const drawnCards = [];

// Populate the dropdown menu with card names
function populateCardSelect() {
  for (let i = 0; i < totalCards; i++) {
    const option = document.createElement('option');
    option.value = i + 1;
    option.textContent = cardNames[i];
    cardSelect.appendChild(option);
  }
}

// Function to show Previously Drawn Cards title
function showDrawnCardsTitle() {
  const drawnCardsTitle = document.querySelector('#drawnCardsContainer h2');
  drawnCardsTitle.style.display = 'block';
}

// Function to draw a random card
function drawRandomCard() {
  const randomCard = Math.floor(Math.random() * totalCards) + 1;
  displayCard(randomCard);
  addToDrawnCards(randomCard);
  showDrawnCardsTitle();
  headsOrTailsContainer.style.display = 'none';
  cardContainer.style.display = 'block';
  footer.classList.remove('hidden');
}

// Function to display a specific card
function displayCard(cardNumber) {
  const imagePath = `assets/CardPictures/card_${cardNumber}.jpg`;
  cardImage.src = imagePath;
  cardText.textContent = cardData[cardNumber].text;
  cardCommentary.textContent = cardData[cardNumber].commentary;
  headsOrTailsContainer.style.display = 'none';
  cardContainer.style.display = 'block';
  footer.classList.remove('hidden');
  highlightDrawnCard(cardNumber);
}

// Function to add the drawn card to the list
function addToDrawnCards(cardNumber) {
  const drawnCardsList = document.getElementById('drawnCardsList');
  const listItem = document.createElement('li');
  const cardIndex = drawnCards.length + 1;
  listItem.textContent = cardIndex + '- ' + cardNames[cardNumber - 1];
  listItem.addEventListener('click', function() {
    displayCard(cardNumber);
  });
  drawnCardsList.appendChild(listItem);
  drawnCards.push(cardNumber);
}

// Function to highlight the clicked card in the list
function highlightDrawnCard(cardNumber) {
  const drawnCardsList = document.getElementById('drawnCardsList');
  const listItems = drawnCardsList.getElementsByTagName('li');
  for (let i = 0; i < listItems.length; i++) {
    if (drawnCards[i] === cardNumber) {
      listItems[i].classList.add('highlight');
    } else {
      listItems[i].classList.remove('highlight');
    }
  }
}

// Function to track button clicks using GoatCounter
function trackButtonClick(buttonName) {
  if (typeof goatcounter !== 'undefined' && goatcounter.count) {
    goatcounter.count({
      path: buttonName,
      title: buttonName,
      event: true,
    });
  }
}

// Draw a random card when the button is clicked
drawButton.addEventListener('click', function() {
  drawRandomCard();
  trackButtonClick('Draw Button');
});

// Display the selected card when the dropdown value changes
cardSelect.addEventListener('change', function() {
  const selectedCard = parseInt(cardSelect.value);
  if (selectedCard) {
    displayCard(selectedCard);
  } else {
    cardContainer.style.display = 'none';
    cardContainer.classList.add('hidden');
  }
});

// Populate the dropdown menu and draw a random card when the page loads
window.addEventListener('load', function() {
  populateCardSelect();
  
});

// Hide the "Previously Drawn Cards" title when the page loads
window.addEventListener('load', function() {
  const drawnCardsTitle = document.querySelector('#drawnCardsContainer h2');
  drawnCardsTitle.style.display = 'none';
  populateCardSelect();
});

const headsOrTailsContainer = document.getElementById('headsOrTailsContainer');

const headsOrTailsButton = document.getElementById('headsOrTailsButton');
const footer = document.querySelector('footer');

// Function to handle the "Heads/Tails" button click event
function handleHeadsOrTailsClick() {
  const result = Math.random() < 0.5 ? 'heads' : 'tails';
  let resultElement = document.querySelector('#headsOrTailsContainer img');
  if (!resultElement) {
    resultElement = document.createElement('img');
    resultElement.style.height = '200px';
    resultElement.style.display = 'block';
    resultElement.style.margin = '0 auto';
    headsOrTailsContainer.insertBefore(resultElement, goBackButton);
  }

  if (headsOrTailsContainer.style.display === 'block') {
    resultElement.src = 'assets/coinflip/pause.png';
    setTimeout(() => {
      resultElement.src = `assets/coinflip/${result}.png`;
    }, 300);
  } else {
    resultElement.src = `assets/coinflip/${result}.png`;
    headsOrTailsContainer.style.display = 'block';
    cardContainer.style.display = 'none';
    footer.classList.add('hidden');
  }
}


// Add event listener to the "Heads/Tails" button
headsOrTailsButton.addEventListener('click', function() {
  handleHeadsOrTailsClick();
  trackButtonClick('Heads or Tails Button');
});

const goBackButton = document.getElementById('goBackButton');

// Function to handle the "Go back" button click event
function handleGoBackClick() {
  if (drawnCards.length === 0) {
    // If no card has been drawn, show the home screen
    headsOrTailsContainer.style.display = 'none';
    cardContainer.style.display = 'none';
    drawButton.style.display = 'block';
    headsOrTailsButton.style.display = 'block';
    footer.classList.remove('hidden');
  } else {
    // If a card has been drawn, show the card container
    headsOrTailsContainer.style.display = 'none';
    cardContainer.style.display = 'block';
    footer.classList.remove('hidden');
  }
}

// Add event listener to the "Go back" button
goBackButton.addEventListener('click', handleGoBackClick);

// Pre-download the coin flip images
const coinImages = ['heads.png', 'tails.png', 'pause.png'];
const preloadedImages = [];

function preloadImages() {
  coinImages.forEach(image => {
    const img = new Image();
    img.src = `assets/coinflip/${image}`;
    preloadedImages.push(img);
  });
}

// Call the preloadImages function when the page loads
window.addEventListener('load', preloadImages);
