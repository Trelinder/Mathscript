const UPGRADE_CHALLENGES = [
  {
    id: 'upgrade-2',
    level: 2,
    title: 'Boost the server room',
    question: 'Each run adds 4 compute units. How many do 3 runs add?',
    hint: 'Add 4 three times.',
    choices: [{ id: 'a', label: '8' }, { id: 'b', label: '12' }, { id: 'c', label: '16' }],
    correctId: 'b',
    reward: 50,
  },
  {
    id: 'upgrade-5',
    level: 5,
    title: 'Tune the production line',
    question: 'A rack makes 5 units each second. How many in 4 seconds?',
    hint: 'Multiply 5 units by 4 seconds.',
    choices: [{ id: 'a', label: '20' }, { id: 'b', label: '15' }, { id: 'c', label: '25' }],
    correctId: 'a',
    reward: 150,
  },
  {
    id: 'upgrade-10',
    level: 10,
    title: 'Optimize the whole tower',
    question: 'Six upgrades cost $8 each. What is the total cost?',
    hint: 'Multiply 6 upgrades by $8 each.',
    choices: [{ id: 'a', label: '$42' }, { id: 'b', label: '$54' }, { id: 'c', label: '$48' }],
    correctId: 'c',
    reward: 400,
  },
]

export function getUpgradeChallenges(previousLevelTotal, nextLevelTotal, completedIds = []) {
  return UPGRADE_CHALLENGES.filter(challenge =>
    previousLevelTotal < challenge.level &&
    nextLevelTotal >= challenge.level &&
    !completedIds.includes(challenge.id)
  )
}

export function getChallengeReward(challenge, selectedId) {
  return challenge?.correctId === selectedId ? challenge.reward : 0
}