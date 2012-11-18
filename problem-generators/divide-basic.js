function divideBasic() {
	var num1 = Math.floor(11 * Math.random()) + 1;
	var num2 = Math.floor(11 * Math.random()) + 1;

	var ans = num1 * num2;
	return { question: ans + " / " + num1, answer: num2 };
}

module.exports = divideBasic;