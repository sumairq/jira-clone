import React, { useState } from 'react';
import PropTypes from 'prop-types';

import useApi from 'shared/hooks/api';
import toast from 'shared/utils/toast';
import { color } from 'shared/utils/styles';
import { Modal, Button, Textarea, Spinner } from 'shared/components';

import {
  TriggerButton,
  ModalContents,
  ModalTitle,
  Intro,
  EmptyState,
  LoadingState,
  List,
  Item,
  ItemInput,
  RemoveButton,
  Actions,
  RegenerateButton,
} from './Styles';

const propTypes = {
  issueId: PropTypes.number.isRequired,
  onConfirm: PropTypes.func.isRequired,
};

const SparkleIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color.accent} aria-hidden="true">
    <path d="M12 2l1.9 5.5L19.5 9l-5.6 1.5L12 16l-1.9-5.5L4.5 9l5.6-1.5L12 2z" />
    <path d="M19 14l.9 2.6L22.5 17.5l-2.6.9L19 21l-.9-2.6L15.5 17.5l2.6-.9L19 14z" opacity="0.6" />
  </svg>
);

SparkleIcon.propTypes = { size: PropTypes.number };
SparkleIcon.defaultProps = { size: 16 };

const escapeHtml = text =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

// Quill 2 renders checklists as <ol> items with data-list="unchecked"; this displays
// as checkboxes through the shared .ql-editor styles (read view and editor alike).
const buildChecklistHtml = items => {
  const listItems = items.map(item => `<li data-list="unchecked">${escapeHtml(item)}</li>`).join('');
  return `<p><strong>Acceptance criteria</strong></p><ol>${listItems}</ol>`;
};

const ProjectBoardIssueDetailsSubtaskGenerator = ({ issueId, onConfirm }) => {
  const [isOpen, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [hasGenerated, setHasGenerated] = useState(false);

  const [{ isCreating }, generate] = useApi.post(`/issues/${issueId}/generate-subtasks`);

  const close = () => {
    setOpen(false);
    setItems([]);
    setHasGenerated(false);
  };

  const handleGenerate = async () => {
    try {
      const { subtasks } = await generate();
      setItems(subtasks);
      setHasGenerated(true);
    } catch (error) {
      toast.error(error);
    }
  };

  const updateItem = (index, value) =>
    setItems(current => current.map((item, i) => (i === index ? value : item)));

  const removeItem = index => setItems(current => current.filter((_, i) => i !== index));

  const cleanedItems = items.map(item => item.trim()).filter(Boolean);

  const handleConfirm = () => {
    onConfirm(buildChecklistHtml(cleanedItems));
    close();
  };

  return (
    <>
      <TriggerButton variant="empty" icon={<SparkleIcon />} onClick={() => setOpen(true)}>
        Generate subtasks
      </TriggerButton>

      <Modal
        isOpen={isOpen}
        width={540}
        withCloseIcon
        onClose={close}
        renderContent={() => (
          <ModalContents>
            <ModalTitle>
              <SparkleIcon size={20} />
              AI subtask breakdown
            </ModalTitle>
            <Intro>
              Suggest a checklist of subtasks for this issue. Review and edit the suggestions —
              nothing is saved until you add them to the description.
            </Intro>

            {isCreating && (
              <LoadingState>
                <Spinner size={20} color={color.primary} />
                Generating subtasks…
              </LoadingState>
            )}

            {!isCreating && !hasGenerated && (
              <EmptyState>
                <Button variant="primary" icon={<SparkleIcon />} onClick={handleGenerate}>
                  Generate subtasks
                </Button>
              </EmptyState>
            )}

            {!isCreating && hasGenerated && (
              <>
                <List>
                  {items.map((item, index) => (
                    <Item key={index}>
                      <ItemInput>
                        <Textarea
                          minRows={1}
                          value={item}
                          onChange={value => updateItem(index, value)}
                        />
                      </ItemInput>
                      <RemoveButton
                        type="button"
                        aria-label="Remove subtask"
                        onClick={() => removeItem(index)}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M6 6l12 12M18 6L6 18"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            fill="none"
                          />
                        </svg>
                      </RemoveButton>
                    </Item>
                  ))}
                </List>

                <Actions>
                  <RegenerateButton variant="empty" onClick={handleGenerate}>
                    Regenerate
                  </RegenerateButton>
                  <Button variant="empty" onClick={close}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    disabled={cleanedItems.length === 0}
                    onClick={handleConfirm}
                  >
                    Add to description
                  </Button>
                </Actions>
              </>
            )}
          </ModalContents>
        )}
      />
    </>
  );
};

ProjectBoardIssueDetailsSubtaskGenerator.propTypes = propTypes;

export default ProjectBoardIssueDetailsSubtaskGenerator;
