import styled from 'styled-components';

import { color, font, mixin } from 'shared/utils/styles';
import Button from 'shared/components/Button';

export const TriggerButton = styled(Button)`
  padding: 0 8px;
  ${font.size(13)}
`;

export const ModalContents = styled.div`
  padding: 20px 25px 25px;
`;

export const ModalTitle = styled.div`
  display: flex;
  align-items: center;
  padding-bottom: 6px;
  ${font.medium}
  ${font.size(20)}
  svg {
    margin-right: 8px;
  }
`;

export const Intro = styled.div`
  padding-bottom: 18px;
  color: ${color.textMedium};
  ${font.size(14.5)}
`;

export const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
`;

export const LoadingState = styled.div`
  display: flex;
  align-items: center;
  padding: 6px 0 18px;
  color: ${color.textMedium};
  ${font.size(14.5)}
  & > div:first-child {
    margin-right: 10px;
  }
`;

export const List = styled.div`
  margin-bottom: 6px;
`;

export const Item = styled.div`
  display: flex;
  align-items: flex-start;
  margin-bottom: 8px;
`;

export const ItemInput = styled.div`
  flex: 1;
`;

export const RemoveButton = styled.button`
  margin: 6px 0 0 6px;
  padding: 2px;
  color: ${color.textLight};
  ${mixin.clickable}
  transition: color 0.1s;
  &:hover {
    color: ${color.danger};
  }
`;

export const Actions = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-top: 18px;
  & > button {
    margin-left: 8px;
  }
`;

export const RegenerateButton = styled(Button)`
  margin-right: auto;
  margin-left: 0;
`;
