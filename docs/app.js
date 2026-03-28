// Updated CSS styles and render function for archive milestones

const renderArchiveMilestones = (milestones) => {
    return milestones.map(milestone => {
        return `<div class='milestone'>
                    <h2 style='color: blue;'>${milestone.title}</h2>
                    <p>${milestone.description}</p>
                </div>`;
    }).join('');
};

export { renderArchiveMilestones };