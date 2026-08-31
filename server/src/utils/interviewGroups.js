const NO_SHOW_GROUP_NUMBER = 101;

function isNoShowGroup(groupNumber) {
  return Number(groupNumber) === NO_SHOW_GROUP_NUMBER;
}

module.exports = {
  NO_SHOW_GROUP_NUMBER,
  isNoShowGroup,
};
