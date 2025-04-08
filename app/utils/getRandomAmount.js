// Generate a random MON amount
const generateRandomAmount = () => {
  // Generate a random amount between 0.001 and 0.002 MON
  const baseAmount = 0.001;
  const randomPart = Math.random() * 0.001;
  const amount = baseAmount + randomPart;
  // Format to 9 decimal places
  return amount.toFixed(9);
};

// Generate and print a few examples of random amounts
console.log('Example random amounts:');
for (let i = 0; i < 5; i++) {
  console.log(generateRandomAmount());
}

module.exports = { generateRandomAmount }; 