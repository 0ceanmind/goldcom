// Drive the actual Goldcom menu, including its value-to-option mapping.
export async function chooseOption(page, control, value) {
  await control.click();
  await page.locator(`.gc-select-menu [role="option"][data-value=${JSON.stringify(String(value))}]`).click();
}

export async function optionValues(page, control) {
  await control.click();
  const values = await page.locator('.gc-select-menu [role="option"]').evaluateAll(options => options.map(option => option.dataset.value));
  await page.keyboard.press('Escape');
  return values;
}
