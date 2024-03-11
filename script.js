

const drawButton = document.getElementById('drawButton');
const cardContainer = document.getElementById('cardContainer');
const cardImage = document.getElementById('cardImage');
const cardText = document.getElementById('cardText');
const cardCommentary = document.getElementById('cardCommentary');

const totalCards = 79;


// Function to draw a random card
function drawRandomCard() {
  const randomCard = Math.floor(Math.random() * totalCards) + 1;
  const imagePath = `CardPictures/card_${randomCard}.jpg`;
  cardImage.src = imagePath;
  cardText.textContent = cardData[randomCard].text;
  cardCommentary.textContent = cardData[randomCard].commentary;
  cardContainer.style.display = 'block';
}

// Draw a random card when the page loads
window.addEventListener('load', drawRandomCard);

// Draw a random card when the button is clicked
drawButton.addEventListener('click', drawRandomCard);